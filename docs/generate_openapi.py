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

    def process_schema(schema, examples=None):
        if not schema:
            return None
        
        def fix_schema_node(node):
            if isinstance(node, dict):
                # Fix file type to string with binary format
                if node.get("type") == "file":
                    node["type"] = "string"
                    node["format"] = "binary"
                
                # Move examples to example
                if "examples" in node:
                    if isinstance(node["examples"], list) and node["examples"]:
                        node["example"] = node["examples"][0]
                    del node["examples"]
                
                # Recursively process all properties
                for key, value in node.items():
                    if isinstance(value, (dict, list)):
                        fix_schema_node(value)
            elif isinstance(node, list):
                for item in node:
                    if isinstance(item, (dict, list)):
                        fix_schema_node(item)
        
        # Apply all fixes
        fix_schema_node(schema)
        fix_numeric_constraints(schema)
        add_defaults_to_schema(schema)
        
        # Add examples if provided
        if examples:
            schema["example"] = examples
        
        return schema

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
