import yaml
import os
import json

def generate_openapi(api_definitions_path, output_file):
    """Generates an OpenAPI specification with subnet ID in paths, 
       fixed Bearer auth, ordered by subnet ID, and includes default values."""

    openapi = {
        "openapi": "3.0.0",
        "info": {
            "title": "Bitmind API Oracle Docs",
            "version": "v1",
            "description": "Bitmind Oracle API Documentation.",
        },
        "servers": [{"url": "https://api.bitmind.ai/oracle/v1"},
                    {"url": "https://staging-api.bitmind.ai/oracle/v1"},
                    {"url": "http://localhost:3000/prod/oracle/v1"},
                    {"url": "http://localhost:3000/staging/oracle/v1"}],
        "paths": {},
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "apiKey",
                    "description": "API Key in Bearer format"
                }
            }
        },
        "security": [{"bearerAuth": []}]  # Added global security
    }

    # Helper function to add defaults to schema properties
    def add_defaults_to_schema(schema):
        if schema and schema.get("properties"):
            for prop_name, prop_details in schema["properties"].items():
                if "default" in prop_details:
                    continue  # Skip if already has a default
                if "properties" in prop_details:
                    add_defaults_to_schema(prop_details)

                # Example of adding default to string if no example provided
                if prop_details.get('type') == 'string' and 'example' not in prop_details and 'default' not in prop_details:
                    prop_details['default'] = '' # or some other appropriate default
                if prop_details.get('type') == 'integer' and 'example' not in prop_details and 'default' not in prop_details:
                    prop_details['default'] = 0
                if prop_details.get('type') == 'boolean' and 'example' not in prop_details and 'default' not in prop_details:
                    prop_details['default'] = False

        return schema

    # Collect paths first, then sort
    all_paths = {}
    for root, _, files in os.walk(api_definitions_path):
        # Extract the subnet ID from the directory path.
        subnet_id = os.path.basename(root)
        if not subnet_id.isdigit():  # Skip if not a digit folder
            continue

        for file in files:
            if file.endswith(".yml") or file.endswith(".yaml"):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r") as f:
                        data = yaml.safe_load(f)

                        if "endpoints" in data:
                            for endpoint in data["endpoints"]:
                                path = f"/{subnet_id}{endpoint['path']}"  # Prepend subnetId to path
                                method = endpoint["method"].lower()
                                summary = endpoint.get("summary", f"{method.upper()} {path}")
                                description = endpoint.get("description", "")
                                request_body_schema = endpoint.get("requestSchema")


                                # Add default values
                                if request_body_schema:
                                    request_body_schema = add_defaults_to_schema(request_body_schema)

                                request_body = {
                                    "required": True,
                                    "content": {
                                        "application/json": {
                                            "schema": request_body_schema
                                        }
                                    },
                                } if request_body_schema else None

                                all_paths[path, method] = {
                                    "summary": summary,
                                    "description": description,
                                    "requestBody": request_body,
                                    "responses": {
                                        "200": {
                                            "description": "Successful response"
                                        }
                                    },
                                    # "security": [{"bearerAuth": []}]  # Apply Bearer security (removed - Global security instead)
                                }
                except yaml.YAMLError as e:
                    print(f"Error reading YAML file {file_path}: {e}")

    # Sort paths by subnet ID (numerically)
    sorted_paths = sorted(all_paths.keys(), key=lambda x: int(x[0].split('/')[1]))

    # Add the sorted paths to the openapi spec
    for path_method in sorted_paths:
        path, method = path_method
        if path not in openapi["paths"]:
            openapi["paths"][path] = {}
        openapi["paths"][path][method] = all_paths[path_method]

    return openapi

if __name__ == "__main__":
    # Configuration
    API_DEFINITIONS_PATH = "../subnets"  # Path to the subnets directory (relative to the project root)
    OUTPUT_FILE = "./openapi.json"  # Path to save the openapi.json file (relative to the project root)

    # Generate OpenAPI specification
    openapi_spec = generate_openapi(API_DEFINITIONS_PATH, OUTPUT_FILE)

    # Save to a file (or print to stdout)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(openapi_spec, f, indent=2)

    print(f"OpenAPI specification generated and saved to {OUTPUT_FILE}")