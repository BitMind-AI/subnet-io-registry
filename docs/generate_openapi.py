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

    # Load an example file if it exists
    def load_example_file(subnet_id, endpoint_path, file_type):
        # Convert /path/to/endpoint to path_to_endpoint directory name
        endpoint_dir = endpoint_path.strip('/').replace('/', '_')
        example_dir = os.path.join(api_definitions_path, subnet_id, "examples", endpoint_dir)
        example_file = os.path.join(example_dir, f"{file_type}.json")
        
        if os.path.exists(example_file):
            try:
                with open(example_file, "r") as f:
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
                                path = f"/{subnet_id}{endpoint['path']}"  # Prepend subnetId to path
                                endpoint_path = endpoint['path']
                                method = endpoint["method"].lower()
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
                                
                                # First, check for examples in the endpoint directory structure
                                endpoint_name = endpoint_path.strip('/').replace('/', '_')
                                examples_path = os.path.join(api_definitions_path, subnet_id, "examples")
                                
                                if os.path.exists(examples_path):
                                    for example_dir in os.listdir(examples_path):
                                        example_dir_path = os.path.join(examples_path, example_dir)
                                        if os.path.isdir(example_dir_path):
                                            endpoint_match = False
                                            
                                            # Check different ways that endpoint directories might be named
                                            if example_dir == endpoint_path.strip('/'):
                                                endpoint_match = True
                                            # For paths like /chat/completions matching chat_completions
                                            elif example_dir == endpoint_name:
                                                endpoint_match = True
                                            # For paths like /completions matching completions (exact match)
                                            elif example_dir == endpoint_path.lstrip('/'):
                                                endpoint_match = True
                                            
                                            if endpoint_match:
                                                example_request_path = os.path.join(example_dir_path, "request.json")
                                                example_response_path = os.path.join(example_dir_path, "response.json")
                                                
                                                if os.path.exists(example_request_path):
                                                    try:
                                                        with open(example_request_path, "r") as f:
                                                            request_example = json.load(f)
                                                        print(f"Loaded request example for {subnet_id}{endpoint_path} from {example_request_path}")
                                                    except Exception as e:
                                                        print(f"Error loading request example {example_request_path}: {e}")
                                                
                                                if os.path.exists(example_response_path):
                                                    try:
                                                        with open(example_response_path, "r") as f:
                                                            response_example = json.load(f)
                                                        print(f"Loaded response example for {subnet_id}{endpoint_path} from {example_response_path}")
                                                    except Exception as e:
                                                        print(f"Error loading response example {example_response_path}: {e}")
                                
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
                                
                                # Check for example requests in query params for GET methods
                                if method.lower() == "get" and endpoint.get("queryParams"):
                                    # Try various directory naming patterns to find the examples
                                    possible_example_dirs = [
                                        os.path.join(api_definitions_path, subnet_id, "examples", endpoint_path.strip('/')),  # /path
                                        os.path.join(api_definitions_path, subnet_id, "examples", endpoint_path.strip('/').replace('/', '_')),  # path_subpath
                                        os.path.join(api_definitions_path, subnet_id, "examples", endpoint_path.lstrip('/')),  # path without leading slash
                                    ]
                                    
                                    # For handling specific endpoint directories that don't match the path pattern
                                    if endpoint_path.strip('/') == 'twitter/user/latest':
                                        possible_example_dirs.append(os.path.join(api_definitions_path, subnet_id, "examples", "twitter-user-latest"))
                                    elif endpoint_path.strip('/') == 'twitter/user/posts':
                                        possible_example_dirs.append(os.path.join(api_definitions_path, subnet_id, "examples", "twitter-user-posts"))
                                    elif endpoint_path.strip('/') == 'twitter/user/replies':
                                        possible_example_dirs.append(os.path.join(api_definitions_path, subnet_id, "examples", "twitter-user-replies"))
                                    elif endpoint_path.strip('/') == 'twitter/post/replies':
                                        possible_example_dirs.append(os.path.join(api_definitions_path, subnet_id, "examples", "twitter-post-replies"))
                                    elif endpoint_path.strip('/') == 'twitter/post/retweets':
                                        possible_example_dirs.append(os.path.join(api_definitions_path, subnet_id, "examples", "twitter-post-retweets"))
                                    # Add more special cases as needed

                                    for example_dir in possible_example_dirs:
                                        if os.path.isdir(example_dir):
                                            example_request_path = os.path.join(example_dir, "request.json")
                                            if os.path.exists(example_request_path):
                                                try:
                                                    with open(example_request_path, "r") as f:
                                                        query_example = json.load(f)
                                                        
                                                        # For GET requests with query parameters, create examples section
                                                        if isinstance(query_example, dict):
                                                            # 1. Update individual parameter examples
                                                            for param in endpoint_obj.get("parameters", []):
                                                                if param["name"] in query_example:
                                                                    param["example"] = query_example[param["name"]]
                                                            
                                                            # In OpenAPI, examples go within the parameters themselves, not at the operation level
                                                            # We've already added individual parameter examples above
                                                            
                                                            print(f"Added query parameter examples for {path} from {example_request_path}")
                                                except Exception as e:
                                                    print(f"Error loading query example {example_request_path}: {e}")
                                                break
                                
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