# Subnet API Registry Documentation

This directory (`docs`) contains the script [`generate_openapi.py`](generate_openapi.py) to generate the OpenAPI specification (`openapi.json`) for the Bitmind API Oracle Docs. It also provides instructions on how to serve the generated documentation using Swagger UI with Docker.

## Prerequisites

- Python 3.6 or higher
- `pip` (Python package installer)
- Docker

## 1. Create a Python Virtual Environment (Recommended)

It's best practice to create a virtual environment to isolate your project dependencies.

```bash
python3 -m venv .venv
```

## 2. Activate the Virtual Environment

**Linux/macOS:**

```bash
source .venv/bin/activate
```

**Windows (Command Prompt):**

```cmd
.venv\Scripts\activate
```

**Windows (PowerShell):**

```powershell
.venv\Scripts\Activate.ps1
```

## 3. Install Python Requirements

Install the required Python packages using `pip`:

```bash
pip install -r requirements.txt
```

## 4. Generate the `openapi.json` File

Run the `generate_openapi.py` script to generate the `openapi.json` file. This script reads API definitions from the `../subnets` directory and creates the OpenAPI specification.

```bash
python generate_openapi.py
```

> **Important:** Make sure you run this command from the `docs` directory (where `generate_openapi.py` is located). The script will generate `openapi.json` in the same directory, as it uses the current working directory (`${PWD}`).

## 5. Serve Swagger UI with Docker

There are two ways to serve Swagger UI with Docker: using a `run.sh` script or a raw `docker run` command.

### Option 1: Using the `run.sh` Script (Simplest)

1. Ensure the `run.sh` file is in the root directory of your project (one level up from the `docs` directory). Create it if it does not exist.
2. Make the `run.sh` script executable:

   ```bash
   chmod +x ./run.sh
   ```

3. Run the `run.sh` script from the `docs` directory:

   ```bash
   ./run.sh
   ```

   This script contains the `docker run` command to serve the generated `openapi.json` file. Note: If the output of `openapi.json` is not at the expected location (`../`), the current setup may not work.

### Option 2: Using the Raw `docker run` Command

Alternatively, run the following command directly in your terminal from the `docs` directory:

```bash
docker run -p 8080:8080 \
           -v ${PWD}/../:/usr/share/nginx/html \
           -e SWAGGER_JSON=/openapi.json \
           swaggerapi/swagger-ui
```

> **Note:** Running the command from the `docs` directory is crucial. Otherwise, `${PWD}` might resolve incorrectly, leading to errors and misconfiguration.

## 6. Access Swagger UI

Open your web browser and navigate to [http://localhost:8080](http://localhost:8080) to view your API documentation served by Swagger UI.

