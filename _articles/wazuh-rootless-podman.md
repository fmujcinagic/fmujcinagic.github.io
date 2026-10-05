---
layout: post
title: Wazuh rootless on Podman
date: 2026-10-04
description: A rootless Podman deployment for the full Wazuh stack, driven by one interactive CLI, plus an integration hub with decoders, rules and dashboards for Podman, network bandwidth and Keycloak.
category: Research
tags:
  - Wazuh
  - Podman
  - Rootless
  - Quadlet
  - systemd
  - Ansible
  - Detection Engineering
  - Keycloak
cover_image: /assets/wazuh-rootless-podman-cover.svg
post_type: writeup
---

# Wazuh rootless on Podman

I needed to run the Wazuh on RHEL-family distros, and the official deployment story is either native systemd service or Docker deployment. `dockerd` is a root daemon with a root-equivalent socket, adding a user to the `docker` group hands over the host, and Docker is not in the repos while Podman is. So I built the deployment I wanted: the whole single-node Wazuh stack, indexer, manager and dashboard, running entirely as a rootless Podman user under systemd and Quadlet, with no root service and no daemon. I also noticed that the official documentation doesn't provide/reference the integration for Podman container lifecycle, network bandwidth and Keycloak authentication, so I wrote the  decoders, rules and dashboards for those purposes.

## Why not Docker

The Docker daemon runs as root and its socket is root-equivalent. Adding an operator to the `docker` group is giving away the host, which does not survive a least-privilege or hardened baseline review. Workarounds that run the root daemon as a normal user, [`dockerrootplease`](https://fosterelli.co/privilege-escalation-via-docker) being the usual one, just relocate the problem: you still depend on a root-owned socket, it can break under SELinux enforcing and cgroup or storage driver changes, and it is not supported by the distribution. Docker is also not in the standard RHEL repositories. Podman is.

Podman runs containers under the calling user with a user namespace and no daemon. [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) is Podman's supported way to run containers under systemd (the older [`podman generate systemd`](https://docs.podman.io/en/latest/markdown/podman-generate-systemd.1.html) is deprecated in its favour), so the stack is supervised as user services, survives reboots, and can be upgraded by a regular user without root or Docker. Rootless containers cannot bind ports below 1024, so the dashboard lands on 8443 and syslog on 5514.

## The deployment

A single `./wazuh.cfg` drives everything. It asks for the deployment type up front and then for the target, renders `ansible/deploy/inventory/hosts.yml` and runs the playbook. There are three modes: standalone server (indexer + manager + dashboard, acting as cluster master), worker manager plus a local agent, and agent only.

![Deploy demo](/assets/deploy-demo.gif)

The stack runs as a dedicated `wazuh` user. The units are Quadlet `.container` files under `~wazuh/.config/containers/systemd`, started and supervised by the systemd user manager with linger on, so a reboot brings the stack back without anyone logging in. TLS certificates are generated offline inside the certs-generator image, passwords are generated on first run into `vault/<host>.yml` and live in the Podman secret store, and the target never touches the internet because the images ship as an offline bundle. Repeat runs converge to zero changes.

```bash
$ sudo -iu wazuh
$ podman ps
CONTAINER ID  IMAGE                                   COMMAND            CREATED      STATUS      PORTS                                                                              NAMES
ee66ca339210  docker.io/wazuh/wazuh-indexer:4.14.7    opensearchwrapper  4 hours ago  Up 4 hours  0.0.0.0:9200->9200/tcp                                                             wazuh.indexer
f9d312a47ba8  docker.io/wazuh/wazuh-dashboard:4.14.7                     4 hours ago  Up 4 hours  0.0.0.0:8443->5601/tcp, 443/tcp                                                    wazuh.dashboard
20feab7c1034  docker.io/wazuh/wazuh-manager:4.14.7                       3 hours ago  Up 3 hours  0.0.0.0:1514-1516->1514-1516/tcp, 0.0.0.0:55000->55000/tcp, 0.0.0.0:5514->514/udp  wazuh.manager
```

Those containers belong to `wazuh`, not root, and `systemctl --user status 'wazuh-*'` lists them as ordinary user units.

Workers join with the cluster key and the master's indexer passwords; the CLI can also pull the manager certificates from the master over ssh. The agent mode is the lightest path: point it at a manager, give it a name and a group, and it enrolls on 1515 and pushes events on 1514. A reboot of both VMs brought the stacks back with no intervention, which is the part I actually care about.

## The integration hub

The second repository is the detection content. Each integration ships a collector or an agent snippet, decoders, rules, an index template, a dashboard and tests:

- **Podman**: lifecycle events, per-container CPU, memory, network and block I/O, and a security benchmark (privileged, host namespaces, runtime socket mounts, missing limits, writable rootfs).
- **Network bandwidth**: per-interface counters, Wazuh connection bytes and retransmissions, TCP segment counters, ICMP latency to the manager.
- **Keycloak**: login, login failures with their error reason, user enumeration, brute force, disabled accounts, logouts and admin operations.

The Keycloak integration is built on Keycloak's own jboss-logging event listener, so there is no custom SPI to compile. Enable the listener for a realm and Keycloak writes the authentication statements into its console log, the agent tails that file, and the decoders turn each statement into fields. There is also a canonical JSON path for a collector or an SPI listener, but the point is that a stock Keycloak plus a stock agent is enough to get alerts, an index template and a dashboard.

The deploy loads the hub through a Quadlet drop-in. The decoder and rule directories are mounted into the manager and referenced first in its `<ruleset>`, so they are read before the built-in JSON decoder, and nothing in the Wazuh repository is patched. The master imports the index templates and dashboards at the end of the same run.

## Repos

- [wazuh-rootless-podman](https://github.com/fmujcinagic/wazuh-rootless-podman) - the deployment and the interactive CLI
- [wazuh-integration-hub](https://github.com/fmujcinagic/wazuh-integration-hub) - the decoders, rules, dashboards and tests
