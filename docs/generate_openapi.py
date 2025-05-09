import yaml
import os
import json

def generate_openapi(api_definitions_path, output_file):
    """Generates an OpenAPI specification with subnet ID in paths, 
       fixed Bearer auth, ordered by subnet ID, and includes examples from examples/ directory."""

    openapi = {
        "openapi": "3.0.0",
        "info": {
            "title": "Bitmind Intelligence Oracle",
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
        if not isinstance(schema, dict):
            return schema

        # Handle arrays
        if schema.get("type") == "array" and "items" in schema:
            schema["items"] = add_defaults_to_schema(schema["items"])
            return schema

        # Handle objects and their properties
        if "properties" in schema:
            for prop_name, prop_details in schema["properties"].items():
                schema["properties"][prop_name] = add_defaults_to_schema(prop_details)

        # Convert examples -> example
        if "examples" in schema:
            schema["example"] = schema["examples"][0]
            del schema["examples"]

        # Handle min/max values
        if "exclusiveMinimum" in schema:
            if not isinstance(schema["exclusiveMinimum"], bool):
                print(f"Warning: exclusiveMinimum must be a boolean value in {schema}")
                if "minimum" not in schema:
                    schema["minimum"] = schema["exclusiveMinimum"]
                del schema["exclusiveMinimum"]
        if "exclusiveMaximum" in schema:
            if not isinstance(schema["exclusiveMaximum"], bool):
                print(f"Warning: exclusiveMaximum must be a boolean value in {schema}")
                if "maximum" not in schema:
                    schema["maximum"] = schema["exclusiveMaximum"]
                del schema["exclusiveMaximum"]

        # Add defaults for basic types if not present
        if "type" in schema and "default" not in schema and "example" not in schema:
            # Don't add defaults if there's an enum
            if "enum" not in schema:
                if schema["type"] == "string":
                    schema["default"] = ""
                elif schema["type"] == "integer":
                    schema["default"] = 0
                elif schema["type"] == "boolean":
                    schema["default"] = False
                elif schema["type"] == "number":
                    schema["default"] = 0.0

        return schema

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
                                    
                                    # Process schema properties
                                    if request_body and request_body_schema and "properties" in request_body_schema:
                                        for prop_name, prop_details in request_body_schema["properties"].items():
                                            if "exclusiveMinimum" in prop_details:
                                                if not isinstance(prop_details["exclusiveMinimum"], bool):
                                                    if "minimum" not in prop_details:
                                                        prop_details["minimum"] = prop_details["exclusiveMinimum"]
                                                    del prop_details["exclusiveMinimum"]
                                            if "exclusiveMaximum" in prop_details:
                                                if not isinstance(prop_details["exclusiveMaximum"], bool):
                                                    if "maximum" not in prop_details:
                                                        prop_details["maximum"] = prop_details["exclusiveMaximum"]
                                                    del prop_details["exclusiveMaximum"]
                                    
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
                                        if param_type == "array":
                                            param_obj["schema"] = {
                                                "type": "array",
                                                "items": {
                                                    "type": param.get("items", {}).get("type", "string")
                                                }
                                            }
                                            # Copy any additional properties from items
                                            if "items" in param and isinstance(param["items"], dict):
                                                param_obj["schema"]["items"].update(param["items"])
                                        else:
                                            param_obj["schema"] = {"type": param_type}
                                        
                                        # Handle enum values
                                        if "enum" in param:
                                            param_obj["schema"]["enum"] = param["enum"]
                                            # Use first enum value as default only if no default specified
                                            if "default" not in param:
                                                param_obj["schema"]["default"] = param["enum"][0]
                                        
                                        # Handle min/max values
                                        if "minimum" in param:
                                            param_obj["schema"]["minimum"] = param["minimum"]
                                        if "maximum" in param:
                                            param_obj["schema"]["maximum"] = param["maximum"]
                                        if "exclusiveMinimum" in param:
                                            if not isinstance(param["exclusiveMinimum"], bool):
                                                print(f"Warning: exclusiveMinimum must be a boolean value in {param}")
                                                continue
                                            param_obj["schema"]["exclusiveMinimum"] = param["exclusiveMinimum"]
                                        if "exclusiveMaximum" in param:
                                            if not isinstance(param["exclusiveMaximum"], bool):
                                                print(f"Warning: exclusiveMaximum must be a boolean value in {param}")
                                                continue
                                            param_obj["schema"]["exclusiveMaximum"] = param["exclusiveMaximum"]
                                        
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