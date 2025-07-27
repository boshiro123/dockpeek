<div align="center">
  <a href="https://github.com/dockpeek/dockpeek">
     <img src="static/logo_2.svg" alt="dockpeek logo" width="80" height="80"/>
  </a>
</div>

<h1 align="center">Dockpeek</h1>
<h3 align="center">Docker Port Dashboard for Easy Container Access</h3>

<br>
<br>

**Dockpeek** is a lightweight, self-hosted Docker dashboard that allows you to view and access exposed container ports with a clean, click-to-access interface. It supports both local Docker sockets and remote hosts via `socket-proxy`, making it easy to manage multiple Docker environments from a single place.


### Key Features

-  **Port Mapping Overview** – Quickly see all running containers and their exposed ports.
-  **Click-to-Access URLs** – Open containerized web apps instantly with a single click.
-  **Multi-Host Support** – Manage multiple Docker hosts and sockets within one dashboard.
-  **Zero Configuration** – Automatically detects running containers with no setup required.

<br>

<div align="center">

![Dockpeek Night mode screenshot](screenshot.png)

</div>

<br>

### Why Use Dockpeek?

Tired of remembering IP addresses and port numbers to access your containerized apps? **Dockpeek** gives you a clean, centralized dashboard with one-click access to any exposed container service—whether it's running locally or remotely.

Perfect when you're dealing with many containers across different machines. Whether you're a developer, a sysadmin, or just managing your home lab, Dockpeek keeps things simple and organized.

<br>

## 🔧 Installation

### Option 1: Direct Socket Access
```yaml
services:
  dockpeek:
    image: ghcr.io/dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=my_secret_key   # Set secret key
      - USERNAME=admin             # Change default username
      - PASSWORD=admin             # Change default password
    ports:
      - "3420:8000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

<br>

### Option 2: Using `socket-proxy`


```yaml
services:
  dockpeek:
    image: ghcr.io/dockpeek/dockpeek:latest
    container_name: dockpeek
    environment:
      - SECRET_KEY=my_secret_key   # Set secret key
      - USERNAME=admin             # Change default username
      - PASSWORD=admin             # Change default password
      - DOCKER_HOST=tcp://dockpeek-socket-proxy:2375
    ports:
      - "3420:8000"
    depends_on:
      - dockpeek-socket-proxy
    restart: unless-stopped

  dockpeek-socket-proxy:   # socket-proxy for Docker API
    image: lscr.io/linuxserver/socket-proxy:latest
    container_name: dockpeek-socket-proxy
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - PING=1
      - VERSION=1
      - LOG_LEVEL=info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    read_only: true
    tmpfs:
      - /run
    ports:
      - "2375:2375"
    restart: unless-stopped
```

<br>

###  Add Additional Docker Hosts

You can connect and manage multiple Docker instances from a single dashboard.

The easiest way to do this is by installing a Docker Socket Proxy on each Docker host. This exposes the Docker API via an HTTP port (e.g., 2375), allowing secure and controlled remote access to each instance.

```yaml
    environment:
      - SECRET_KEY=my_secret_key     # Set a secret key for security
      - USERNAME=admin               # Change
      - PASSWORD=admin               # Change
      
      # Optional: Add extra Docker hosts by setting these variables.

      # Docker Host 1
      - DOCKER_HOST_1_URL=unix:///var/run/docker.sock    # Docker socket URL
      - DOCKER_HOST_1_NAME=MyServer1                     # Name shown in the UI
      - DOCKER_HOST_1_PUBLIC_HOSTNAME=                   # (Optional) public adress; if empty, inferred from URL
      
      # Docker Host 2
      - DOCKER_HOST_2_URL=tcp://192.168.1.168:2375     
      - DOCKER_HOST_2_NAME=Synology                    
      - DOCKER_HOST_2_PUBLIC_HOSTNAME=NAS              
      
      # Add more Docker hosts by increasing the number (3, 4, etc.)

```
  
> [!NOTE]
> `unix:///var/run/docker.sock`   Requires mounting the Docker socket `volumes: /var/run/docker.sock:/var/run/docker.sock`


<br>

## Environment Variables

| Variable                        | Description                                                                 |
|---------------------------------|-----------------------------------------------------------------------------|
| `SECRET_KEY`                    | A strong, unique secret.                                                    |
| `USERNAME`                      | Username for Dockpeek login.                                                |
| `PASSWORD`                      | Password for Dockpeek login.                                                |  
| `DOCKER_HOST`                   | URL of the Docker Socket (e.g., `unix:///var/run/docker.sock` for local, or `tcp://socket-proxy:2375` via a local proxy). |
| `DOCKER_HOST_NAME`              | Name shown in the UI ("local" is default)                                                       |
| `DOCKER_HOST_PUBLIC_HOSTNAME`   | Public hostname or IP for clickable links (optional)                                  |

### Additional Docker Hosts
| Variable                        | Description                                                                 |
|---------------------------------|-----------------------------------------------------------------------------|
| `DOCKER_HOST_N_URL`            | URL for Docker hosts (e.g., `tcp://192.168.1.10:2375`). `N` is a numeric identifier (1, 2, 3, etc.). |
| `DOCKER_HOST_N_NAME`           | Name shown in the UI                                                        |
| `DOCKER_HOST_N_PUBLIC_HOSTNAME`| Public hostname or IP for clickable links (e.g. 'NAS' for Tailscale access). If unset, it's inferred from the `DOCKER_HOST_N_URL`. |
  
> [!NOTE]
> All multi-host variables (`DOCKER_HOST_N_*`) must use matching `N` indices for URL, name, and hostname entries.