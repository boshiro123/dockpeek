import os
import re
from flask import Flask, render_template, request, jsonify, redirect, url_for
import docker
from flask_cors import CORS
from flask_login import (
    LoginManager, UserMixin, login_user,
    logout_user, login_required, current_user
)
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse
from docker.client import DockerClient
from docker.constants import DEFAULT_TIMEOUT_SECONDS

# === Flask Init ===
app = Flask(__name__)
secret_key = os.environ.get("SECRET_KEY")
if not secret_key:
    raise RuntimeError("ERROR: SECRET_KEY environment variable is not set.")

app.secret_key = secret_key
CORS(app)

# === Flask-Login Init ===
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# === User credentials from environment ===
ADMIN_USERNAME = os.environ.get("USERNAME")
ADMIN_PASSWORD = os.environ.get("PASSWORD")

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise RuntimeError("USERNAME and PASSWORD environment variables must be set.")

# Hashed user storage
users = {
    ADMIN_USERNAME: {
        "password": generate_password_hash(ADMIN_PASSWORD)
    }
}

class User(UserMixin):
    def __init__(self, id):
        self.id = id

@login_manager.user_loader
def load_user(user_id):
    if user_id in users:
        return User(user_id)
    return None

@login_manager.unauthorized_handler
def unauthorized_callback():
    return redirect(url_for('login'))

# === Docker Client Logic ===

DOCKER_TIMEOUT = 0.3  # Timeout in seconds

def _extract_hostname_from_url(url):
    """
    Extracts hostname from Docker URL for public hostname determination.
    Returns None for local connections or internal Docker network names.
    """
    if not url:
        return None
    
    # Handle unix socket - this means local connection
    if url.startswith("unix://"):
        return None  # Will use request.host as fallback
    
    # Handle TCP connections
    if url.startswith("tcp://"):
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname
            if hostname:
                # Local addresses should use request.host
                if hostname in ["127.0.0.1", "0.0.0.0", "localhost"]:
                    return None
                
                # Check if it's likely a Docker Compose service name
                # (internal names usually don't have dots and aren't IP addresses)
                if _is_likely_internal_hostname(hostname):
                    return None  # Requires explicit public_hostname
                
                return hostname  # Return actual remote hostname/IP
        except Exception:
            pass
    
    # Handle other protocols or malformed URLs
    try:
        # Match patterns like tcp://hostname:port or hostname:port
        match = re.search(r"(?:tcp://)?([^:]+)(?::\d+)?", url)
        if match:
            hostname = match.group(1)
            if hostname in ["127.0.0.1", "0.0.0.0", "localhost"]:
                return None
            
            if _is_likely_internal_hostname(hostname):
                return None  # Requires explicit public_hostname
                
            return hostname
    except Exception:
        pass
    
    return None


def _is_likely_internal_hostname(hostname):
    """
    Determines if a hostname is likely an internal Docker network name.
    """
    # If it's an IP address, it's not internal
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if re.match(ip_pattern, hostname):
        return False
    
    # If it contains a dot, it's likely a real domain
    if '.' in hostname:
        return False
    
    # If it's a single word (like 'dockpeek-dev-socket-proxy'), 
    # it's likely a Docker Compose service name
    return True


def _get_link_hostname(public_hostname, host_ip, is_docker_host):
    """
    Determines the correct hostname for generating links.
    """
    # If we have an explicitly set public_hostname, use it
    if public_hostname:
        return public_hostname
    
    # For connections without explicit public_hostname, we need to be smart
    # If host_ip is a real remote IP, use it
    if host_ip and host_ip not in ['0.0.0.0', '127.0.0.1']:
        return host_ip
    
    # For local bindings (0.0.0.0, 127.0.0.1) or when host_ip is None,
    # use request.host as fallback
    # This works for:
    # - Local Docker connections
    # - Docker Compose setups where the app and containers are on the same host
    try:
        return request.host.split(":")[0]
    except:
        # If request is not available (e.g., in tests), fallback to localhost
        return "localhost"


def discover_docker_clients():
    """
    Discovers Docker clients from environment variables and checks their status.
    Returns a list of all discovered servers, including inactive ones.
    """
    clients = []
    
    # Support for DOCKER_HOST for backward compatibility
    if "DOCKER_HOST" in os.environ:
        host_url = os.environ.get("DOCKER_HOST")
        host_name = os.environ.get("DOCKER_HOST_NAME", "default")  # Allow custom name, default to "default"
        public_hostname = os.environ.get("DOCKER_HOST_PUBLIC_HOSTNAME")
        
        # Determine public hostname based on URL if not explicitly set
        if not public_hostname:
            public_hostname = _extract_hostname_from_url(host_url)
            # If still None, it means local connection or internal Docker name
            # - will use request.host later or require explicit configuration
        
        try:
            client = DockerClient(base_url=host_url, timeout=DOCKER_TIMEOUT)
            client.ping()
            clients.append({
                "name": host_name, 
                "client": client, 
                "url": host_url, 
                "public_hostname": public_hostname, 
                "status": "active", 
                "is_docker_host": True,
                "order": 0
            })
            print(f"✅ Discovered and connected to default Docker daemon '{host_name}' at {host_url}")
        except Exception as e:
            print(f"❌ Error connecting to default Docker daemon '{host_name}' at {host_url}: {e}")
            clients.append({
                "name": host_name, 
                "client": None, 
                "url": host_url, 
                "public_hostname": public_hostname, 
                "status": "inactive", 
                "is_docker_host": True,
                "order": 0
            })

    # Discovery of DOCKER_HOST_n_URL and DOCKER_HOST_n_NAME
    host_vars = {k: v for k, v in os.environ.items() if re.match(r"^DOCKER_HOST_\d+_URL$", k)}
    for key, url in host_vars.items():
        match = re.match(r"^DOCKER_HOST_(\d+)_URL$", key)
        if match:
            num = match.group(1)
            name = os.environ.get(f"DOCKER_HOST_{num}_NAME", f"server{num}")
            public_hostname = os.environ.get(f"DOCKER_HOST_{num}_PUBLIC_HOSTNAME")
            
            # Determine public hostname based on URL if not explicitly set
            if not public_hostname:
                public_hostname = _extract_hostname_from_url(url)
                # If still None, it means local connection or internal Docker name
                # - will use request.host later or require explicit configuration
            
            try:
                client = DockerClient(base_url=url, timeout=DOCKER_TIMEOUT)
                client.ping()
                clients.append({
                    "name": name, 
                    "client": client, 
                    "url": url, 
                    "public_hostname": public_hostname, 
                    "status": "active", 
                    "is_docker_host": False,
                    "order": int(num)
                })
                print(f"✅ Discovered and connected to Docker daemon '{name}' at {url}")
            except Exception as e:
                print(f"❌ Error connecting to Docker daemon '{name}' at {url}: {e}")
                clients.append({
                    "name": name, 
                    "client": None, 
                    "url": url, 
                    "public_hostname": public_hostname, 
                    "status": "inactive", 
                    "is_docker_host": False,
                    "order": int(num)
                })

    # If no hosts are configured, try the local socket
    if not clients:
        fallback_name = os.environ.get("DOCKER_NAME", "default")
        print("⚠️ No Docker hosts configured via environment variables. Trying default socket...")
        try:
            client = docker.from_env(timeout=DOCKER_TIMEOUT)
            client.ping()
            clients.append({
                "name": fallback_name, 
                "client": client, 
                "url": "unix:///var/run/docker.sock", 
                "public_hostname": "", 
                "status": "active", 
                "is_docker_host": True,
                "order": 0
            })
            print(f"✅ Discovered and connected to default Docker daemon '{fallback_name}' via socket.")
        except Exception as e:
            print(f"❌ Failed to connect to any Docker daemon, including default socket: {e}")
            clients.append({
                "name": fallback_name, 
                "client": None, 
                "url": "unix:///var/run/docker.sock", 
                "public_hostname": "", 
                "status": "inactive", 
                "is_docker_host": True,
                "order": 0
            })
            
    return clients


def get_all_data():
    """
    Retrieves container data from all discovered Docker hosts.
    """
    servers = discover_docker_clients()
    
    if not servers:
        return {"servers": [], "containers": []}

    all_container_data = []
    # Create a serializable list of servers for the frontend, which can be updated if a fetch fails
    server_list_for_json = [{"name": s["name"], "status": s["status"], "order": s["order"]} for s in servers]

    for host in servers:
        # Skip hosts that were already found to be inactive
        if host['status'] == 'inactive':
            continue
        
        try:
            server_name = host["name"]
            client = host["client"]
            public_hostname = host["public_hostname"]
            is_docker_host = host["is_docker_host"]

            containers = client.containers.list(all=True)

            for container in containers:
                try:
                    # Safely get image information
                    image_name = "unknown"
                    try:
                        if hasattr(container, 'image') and container.image:
                            if hasattr(container.image, 'tags') and container.image.tags:
                                image_name = container.image.tags[0]
                            else:
                                # Fallback to image ID if tags are not available
                                image_name = container.image.id[:12] if hasattr(container.image, 'id') else "unknown"
                    except Exception as img_error:
                        # If image access fails, try to get it from container attrs
                        print(f"⚠️ Could not access image info for container '{container.name}' on '{server_name}': {img_error}")
                        try:
                            image_name = container.attrs.get('Config', {}).get('Image', 'unknown')
                        except:
                            image_name = "missing-image"

                    # Safely get port information
                    ports = container.attrs['NetworkSettings']['Ports']
                    port_map = []

                    if ports:
                        for container_port, mappings in ports.items():
                            if mappings:
                                m = mappings[0]
                                host_port = m['HostPort']
                                host_ip = m.get('HostIp', '0.0.0.0')
                                
                                # Use the unified logic for determining hostname
                                link_hostname = _get_link_hostname(public_hostname, host_ip, is_docker_host)
                                link = f"http://{link_hostname}:{host_port}"
                                
                                port_map.append({
                                    'container_port': container_port,
                                    'host_port': host_port,
                                    'link': link
                                })

                    all_container_data.append({
                        'server': server_name,
                        'name': container.name,
                        'status': container.status,
                        'image': image_name,
                        'ports': port_map
                    })
                    
                except Exception as container_error:
                    # Log individual container errors but continue processing other containers
                    print(f"⚠️ Error processing container '{getattr(container, 'name', 'unknown')}' on '{server_name}': {container_error}")
                    # Still add the container with minimal info
                    all_container_data.append({
                        'server': server_name,
                        'name': getattr(container, 'name', 'unknown'),
                        'status': getattr(container, 'status', 'unknown'),
                        'image': 'error-loading',
                        'ports': []
                    })
                    
        except Exception as e:
            # If an error occurs with a host that was presumed active, mark it as inactive for this response
            print(f"❌ Could not retrieve container data from host '{host.get('name', 'unknown')}'. Error: {e}. Marking as inactive.")
            for s in server_list_for_json:
                if s["name"] == host["name"]:
                    s["status"] = "inactive"
                    break
            continue

    return {"servers": server_list_for_json, "containers": all_container_data}



# === Routes ===

@app.route("/")
def index():
    if current_user.is_authenticated:
        return render_template("index.html")
    return redirect(url_for("login"))

@app.route("/data")
@login_required
def data():
    return jsonify(get_all_data())

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        user_record = users.get(username)
        if user_record and check_password_hash(user_record["password"], password):
            login_user(User(username))
            return redirect(url_for("index"))
        else:
            error = "Invalid credentials. Please try again."
    return render_template("login.html", error=error)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))

# === Entry Point ===
if __name__ == "__main__":
    if not os.path.exists('templates'):
        os.makedirs('templates')
        print("Created 'templates' directory.")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug)