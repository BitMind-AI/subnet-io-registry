import yaml
import os
import json

def generate_openapi(api_definitions_path, output_file):
    """Generates an OpenAPI specification with subnet ID in paths, 
       fixed Bearer auth, ordered by subnet ID, and includes examples from examples/ directory."""

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
        "tags": [],  # Add tags array for grouping
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

    # Helper function to fix numeric constraints
    def fix_numeric_constraints(schema):
        if schema and schema.get("properties"):
            for prop_name, prop_details in schema["properties"].items():
                if "properties" in prop_details:
                    fix_numeric_constraints(prop_details)
                
                # Fix exclusiveMinimum/exclusiveMaximum
                if "exclusiveMinimum" in prop_details and isinstance(prop_details["exclusiveMinimum"], (int, float)):
                    prop_details["minimum"] = prop_details["exclusiveMinimum"]
                    prop_details["exclusiveMinimum"] = True
                
                if "exclusiveMaximum" in prop_details and isinstance(prop_details["exclusiveMaximum"], (int, float)):
                    prop_details["maximum"] = prop_details["exclusiveMaximum"]
                    prop_details["exclusiveMaximum"] = True

    # Helper function to move examples to schema level
    def move_examples_to_schema(schema):
        if schema and schema.get("properties"):
            for prop_name, prop_details in schema["properties"].items():
                if "properties" in prop_details:
                    move_examples_to_schema(prop_details)
                
                # Move examples to schema level
                if "examples" in prop_details:
                    if "example" not in prop_details:
                        prop_details["example"] = prop_details["examples"][0]
                    del prop_details["examples"]

    # Generate possible directory names for an endpoint path
    def get_possible_directory_names(endpoint_path):
        # Remove leading and trailing slashes
        path_clean = endpoint_path.strip('/')
        
        # Generate possible directory names with different separators
        return [
            path_clean,                          # path/to/endpoint
            path_clean.replace('/', '_'),        # path_to_endpoint
            path_clean.replace('/', '-'),        # path-to-endpoint
            path_clean.replace('-', '_'),        # path_to_endpoint (if path has hyphens)
            path_clean.replace('-', '/').replace('/', '_'),  # path_to_endpoint (if path has hyphens and slashes)
            endpoint_path.lstrip('/')            # path/to/endpoint (without leading slash)
        ]
    
    # Load an example file if it exists
    def load_example_file(subnet_id, endpoint_path, file_type):
        # Try different possible directory names
        possible_dirs = get_possible_directory_names(endpoint_path)
        
        for dir_name in possible_dirs:
            example_dir = os.path.join(api_definitions_path, subnet_id, "examples", dir_name)
            example_file = os.path.join(example_dir, f"{file_type}.json")
            
            if os.path.exists(example_file):
                try:
                    with open(example_file, "r") as f:
                        print(f"Loaded {file_type} example for {subnet_id}{endpoint_path} from {example_file}")
                        return json.load(f)
                except Exception as e:
                    print(f"Error loading example file {example_file}: {e}")
        
        return None

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
                                endpoint_path = endpoint['path']
                                method = endpoint["method"].lower()
                                
                                # Handle path parameters in the path
                                path_with_params = f"/{subnet_id}{endpoint_path}"
                                if endpoint.get("pathParams"):
                                    # If the endpoint has path parameters, modify the path to include them
                                    for param in endpoint.get("pathParams"):
                                        param_name = param.get("name")
                                        # If the external path contains this parameter in {param} format
                                        if "{" + param_name + "}" in endpoint.get("externalPath", ""):
                                            # Add the parameter to the path
                                            path_with_params = f"/{subnet_id}{endpoint_path}/{{{param_name}}}"
                                
                                path = path_with_params
                                summary = endpoint.get("summary", f"{method.upper()} {path}")
                                description = endpoint.get("description", "")
                                request_body_schema = endpoint.get("requestSchema")

                                # Add default values
                                if request_body_schema:
                                    request_body_schema = add_defaults_to_schema(request_body_schema)

                                # Get content type from headers or default to application/json
                                content_type = endpoint.get("headers", {}).get("Content-Type", "application/json")
                                
                                # Try to load example request and response
                                request_example = None
                                response_example = None
                                
                                # Load examples using the load_example_file function
                                request_example = load_example_file(subnet_id, endpoint_path, "request")
                                response_example = load_example_file(subnet_id, endpoint_path, "response")
                                
                                # Handle different content types appropriately
                                if content_type == "multipart/form-data" and request_body_schema:
                                    # For multipart/form-data, handle file uploads correctly
                                    # Transform properties with type: file to binary format
                                    form_schema = {
                                        "type": "object",
                                        "properties": {},
                                        "required": request_body_schema.get("required", [])
                                    }
                                    
                                    for prop_name, prop_details in request_body_schema.get("properties", {}).items():
                                        if prop_details.get("type") == "file":
                                            # For file uploads, use binary format
                                            form_schema["properties"][prop_name] = {
                                                "type": "string",
                                                "format": "binary",
                                                "description": prop_details.get("description", "")
                                            }
                                        else:
                                            # For non-file properties
                                            form_schema["properties"][prop_name] = prop_details
                                    
                                    request_body = {
                                        "required": True,
                                        "content": {
                                            "multipart/form-data": {
                                                "schema": form_schema
                                            }
                                        }
                                    }
                                    
                                    # Add example if available
                                    if request_example:
                                        request_body["content"]["multipart/form-data"]["example"] = request_example
                                else:
                                    # Default case for application/json
                                    request_body = {
                                        "required": True,
                                        "content": {
                                            content_type: {
                                                "schema": request_body_schema
                                            }
                                        }
                                    } if request_body_schema else None
                                    
                                    # Add example if available
                                    if request_example and request_body:
                                        request_body["content"][content_type]["example"] = request_example

                                # Create responses object with example if available
                                responses = {
                                    "200": {
                                        "description": "Successful response"
                                    }
                                }
                                
                                # Add response example if available
                                if response_example:
                                    responses["200"]["content"] = {
                                        "application/json": {
                                            "example": response_example
                                        }
                                    }

                                # Handle query parameters for GET requests and others that use them
                                parameters = []
                                if endpoint.get("queryParams"):
                                    for param in endpoint.get("queryParams"):
                                        param_obj = {
                                            "name": param.get("name"),
                                            "in": "query",
                                            "description": param.get("description", ""),
                                            "required": param.get("required", False)
                                        }
                                        
                                        # Set schema type based on param type
                                        param_type = param.get("type", "string")
                                        param_obj["schema"] = {"type": param_type}
                                        
                                        # Handle enum values
                                        if "enum" in param:
                                            param_obj["schema"]["enum"] = param["enum"]
                                        
                                        # Handle min/max values
                                        if "minimum" in param:
                                            param_obj["schema"]["minimum"] = param["minimum"]
                                        if "maximum" in param:
                                            param_obj["schema"]["maximum"] = param["maximum"]
                                        
                                        # Handle default values
                                        if "default" in param:
                                            param_obj["schema"]["default"] = param["default"]
                                        
                                        parameters.append(param_obj)
                                
                                # Handle path parameters
                                if endpoint.get("pathParams"):
                                    for param in endpoint.get("pathParams"):
                                        param_obj = {
                                            "name": param.get("name"),
                                            "in": "path",
                                            "description": param.get("description", ""),
                                            "required": param.get("required", True),
                                            "schema": {"type": param.get("type", "string")}
                                        }
                                        parameters.append(param_obj)
                                
                                # Create the endpoint object
                                endpoint_obj = {
                                    "summary": summary,
                                    "description": description,
                                    "responses": responses
                                }
                                
                                # Add parameters if exist
                                if parameters:
                                    endpoint_obj["parameters"] = parameters
                                
                                # Add request body if exists
                                if request_body:
                                    endpoint_obj["requestBody"] = request_body
                                
                                # For GET requests with query parameters, add examples to parameters
                                if method.lower() == "get" and endpoint.get("queryParams") and request_example:
                                    # Update individual parameter examples
                                    if isinstance(request_example, dict):
                                        for param in endpoint_obj.get("parameters", []):
                                            if param["name"] in request_example:
                                                param["example"] = request_example[param["name"]]
                                
                                all_paths[path, method] = endpoint_obj
                except yaml.YAMLError as e:
                    print(f"Error reading YAML file {file_path}: {e}")

    # First pass: collect subnet information and create tags
    subnet_info = {}
    for subnet_dir in sorted(os.listdir(api_definitions_path)):
        if not subnet_dir.isdigit():
            continue
            
        subnet_path = os.path.join(api_definitions_path, subnet_dir)
        if not os.path.isdir(subnet_path):
            continue
            
        api_file = os.path.join(subnet_path, "api.yml")
        if not os.path.exists(api_file):
            continue
            
        with open(api_file, 'r') as f:
            api_def = yaml.safe_load(f)
            
        base_url = api_def.get('baseUrl', '')
        name = api_def.get('name', f'Subnet {subnet_dir}')
        description = api_def.get('description', f'API endpoints for subnet {subnet_dir} ({base_url})')
        
        # Create tag for this subnet
        tag = {
            "name": name,
            "description": description
        }
        openapi["tags"].append(tag)
        subnet_info[subnet_dir] = {
            "base_url": base_url,
            "name": name
        }

    # Process each API definition
    for subnet_dir in sorted(os.listdir(api_definitions_path)):
        if not subnet_dir.isdigit():
            continue
            
        subnet_path = os.path.join(api_definitions_path, subnet_dir)
        if not os.path.isdir(subnet_path):
            continue
            
        api_file = os.path.join(subnet_path, "api.yml")
        if not os.path.exists(api_file):
            continue
            
        with open(api_file, 'r') as f:
            api_def = yaml.safe_load(f)
            
        base_url = api_def.get('baseUrl', '')
        name = api_def.get('name', f'Subnet {subnet_dir}')
        
        for endpoint in api_def.get('endpoints', []):
            path = endpoint.get('path', '')
            method = endpoint.get('method', '').lower()
            external_path = endpoint.get('externalPath', path)
            
            # Load examples if they exist
            request_example = load_example_file(subnet_dir, external_path, 'request')
            response_example = load_example_file(subnet_dir, external_path, 'response')
            
            # Process request schema
            request_schema = process_schema(endpoint.get('requestSchema'), request_example)
            
            # Process response schema
            response_schema = process_schema(endpoint.get('responseSchema'), response_example)
            
            # Create path entry
            path_entry = {
                method: {
                    "tags": [name],  # Use the subnet name as the tag
                    "summary": f"{method.upper()} {path}",
                    "description": endpoint.get('description', '')
                }
            }
            
            # Only add requestBody for non-GET methods
            if method.lower() != "get" and request_schema:
                path_entry[method]["requestBody"] = {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": request_schema
                        }
                    }
                }
            
            # Add responses
            path_entry[method]["responses"] = {
                "200": {
                    "description": "Successful response",
                    "content": {
                        "application/json": {
                            "schema": response_schema
                        }
                    }
                } if response_schema else {
                    "description": "Successful response"
                }
            }
            
            # Add to paths
            full_path = f"/{subnet_dir}{path}"
            if full_path in openapi["paths"]:
                openapi["paths"][full_path].update(path_entry)
            else:
                openapi["paths"][full_path] = path_entry

    # Write the OpenAPI specification
    with open(output_file, 'w') as f:
        json.dump(openapi, f, indent=2)

if __name__ == "__main__":
    api_definitions_path = "../subnets"
    output_file = "openapi.json"
    generate_openapi(api_definitions_path, output_file)
    print(f"OpenAPI specification generated and saved to {output_file}")
