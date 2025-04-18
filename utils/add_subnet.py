#!/usr/bin/env python3

import os
import sys
import json
import yaml
import requests
import argparse
from pathlib import Path
from typing import Dict, List, Any, Optional, Union

"""
Add or update a subnet in the registry by converting OpenAPI JSON to our API YAML format
and generating example request/response files.

Usage:
  python add_subnet.py <subnet_id> <openapi_url_or_file> [--path-map PATH_MAP]

Examples:
  python add_subnet.py 22 https://apis.datura.ai/openapi.json
  python add_subnet.py 22 ./subnet22_openapi.json --path-map '{"desearch/ai/search": "search"}'
"""

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Add or update a subnet in the registry')
    parser.add_argument('subnet_id', help='Subnet ID (e.g., 22)')
    parser.add_argument('openapi_source', help='OpenAPI JSON URL or file path')
    parser.add_argument('--path-map', type=str, help='JSON string mapping OpenAPI paths to our paths')
    
    args = parser.parse_args()
    
    subnet_id = args.subnet_id
    openapi_source = args.openapi_source
    
    # Parse path map if provided
    path_map = {}
    if args.path_map:
        try:
            path_map = json.loads(args.path_map)
        except json.JSONDecodeError:
            print(f"Error: Invalid JSON in path-map: {args.path_map}")
            sys.exit(1)
    
    try:
        print(f"Adding subnet {subnet_id} from {openapi_source}")
        
        # Load OpenAPI JSON
        if openapi_source.startswith('http'):
            print("Fetching OpenAPI from URL...")
            response = requests.get(openapi_source)
            openapi_json = response.json()
        else:
            print("Loading OpenAPI from file...")
            with open(openapi_source, 'r') as f:
                openapi_json = json.load(f)
        
        # Convert to our API YAML format
        api_yaml = convert_openapi_to_api_yaml(openapi_json, path_map)
        
        # Create subnet directory if it doesn't exist
        # Use absolute path to ensure we're writing to the root subnets directory
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        subnet_dir = os.path.join(root_dir, 'subnets', subnet_id)
        examples_dir = os.path.join(subnet_dir, 'examples')
        
        os.makedirs(subnet_dir, exist_ok=True)
        os.makedirs(examples_dir, exist_ok=True)
        
        # Write API YAML file
        api_yaml_path = os.path.join(subnet_dir, 'api.yml')
        with open(api_yaml_path, 'w') as f:
            # Disable aliases in YAML output
            yaml.dump(api_yaml, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
        print(f"API YAML written to {api_yaml_path}")
        
        # Generate example files for each endpoint
        generate_example_files(api_yaml, subnet_dir)
        
        print("Conversion completed successfully!")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

def convert_openapi_to_api_yaml(openapi_json: Dict, path_map: Dict = None) -> Dict:
    """
    Converts OpenAPI JSON to our API YAML format
    
    Args:
        openapi_json: The OpenAPI JSON object
        path_map: Optional mapping from OpenAPI paths to our internal paths
                  e.g., {"desearch/ai/search": "search"}
    """
    if path_map is None:
        path_map = {}
    base_url = openapi_json.get('servers', [{}])[0].get('url', '')
    
    # Determine the auth configuration by looking at the security schemes
    auth_config = determine_auth_config(openapi_json)
    
    endpoints = []
    
    # Process each path in the OpenAPI spec
    for path, path_item in openapi_json.get('paths', {}).items():
        for method, operation in path_item.items():
            if method in ['parameters', 'summary', 'description']:
                continue  # Skip non-operation properties
            
            # Apply path mapping if available
            internal_path = convert_path_to_our_format(path)
            for openapi_path_fragment, our_path_fragment in path_map.items():
                if openapi_path_fragment in internal_path:
                    internal_path = internal_path.replace(openapi_path_fragment, our_path_fragment)
            
            # Create a fresh auth_config for each endpoint to avoid YAML aliases
            endpoint_auth = dict(auth_config)
            
            endpoint = {
                'path': internal_path,
                'externalPath': path,
                'method': method.upper(),
                'auth': endpoint_auth,
                'headers': {
                    'Content-Type': 'application/json'
                }
            }
            
            # Handle request schema for POST/PUT methods
            if method.upper() in ['POST', 'PUT']:
                if (operation.get('requestBody') and 
                    operation['requestBody'].get('content') and 
                    operation['requestBody']['content'].get('application/json')):
                    schema = operation['requestBody']['content']['application/json'].get('schema', {})
                    
                    # Resolve schema references
                    schema = resolve_schema_references(schema, openapi_json)
                    
                    endpoint['requestSchema'] = schema
                    
                    # Clean up schema
                    cleanup_schema(endpoint['requestSchema'])
            
            # Handle response schema
            if operation.get('responses'):
                for status_code, response in operation['responses'].items():
                    if status_code.startswith('2') and response.get('content') and response['content'].get('application/json'):
                        schema = response['content']['application/json'].get('schema', {})
                        
                        # Resolve schema references
                        schema = resolve_schema_references(schema, openapi_json)
                        
                        endpoint['responseSchema'] = schema
                        
                        # Clean up schema
                        cleanup_schema(endpoint['responseSchema'])
                        break
            
            # Handle query parameters for GET methods
            if method.upper() == 'GET' and operation.get('parameters'):
                query_params = [param for param in operation['parameters'] if param.get('in') == 'query']
                if query_params:
                    endpoint['queryParams'] = []
                    for param in query_params:
                        query_param = {
                            'name': param.get('name', ''),
                            'description': param.get('description', ''),
                            'required': param.get('required', False)
                        }
                        
                        schema = param.get('schema', {})
                        if schema.get('type'):
                            query_param['type'] = schema['type']
                        if 'default' in schema:
                            query_param['default'] = schema['default']
                        if 'minimum' in schema:
                            query_param['minimum'] = schema['minimum']
                        if 'maximum' in schema:
                            query_param['maximum'] = schema['maximum']
                        if 'enum' in schema:
                            query_param['enum'] = schema['enum']
                        if 'example' in param:
                            query_param['example'] = param['example']
                        
                        endpoint['queryParams'].append(query_param)
            
            endpoints.append(endpoint)
    
    return {
        'baseUrl': base_url,
        'endpoints': endpoints
    }

def determine_auth_config(openapi_json: Dict) -> Dict:
    """
    Determines the auth configuration from the OpenAPI JSON
    
    Args:
        openapi_json: The OpenAPI JSON object
        
    Returns:
        A dictionary representing the auth configuration
    """
    # Default auth configuration
    auth_config = {
        'type': 'header',
        'key': 'Authorization',
        'value': '{{api-key}}'
    }
    
    # Check if there are security schemes defined
    if 'components' in openapi_json and 'securitySchemes' in openapi_json['components']:
        security_schemes = openapi_json['components']['securitySchemes']
        
        # Look for API key auth
        for scheme_name, scheme in security_schemes.items():
            if scheme.get('type') == 'apiKey':
                auth_config = {
                    'type': scheme.get('in', 'header'),  # header, query, or cookie
                    'key': scheme.get('name', 'Authorization'),
                    'value': '{{api-key}}'
                }
                
                # If the scheme is in the header and the name is Authorization,
                # check if it's a Bearer token
                if scheme.get('in') == 'header' and scheme.get('name') == 'Authorization':
                    # Check if the description mentions Bearer
                    if 'description' in scheme and 'bearer' in scheme['description'].lower():
                        auth_config['value'] = 'Bearer {{api-key}}'
                
                break
            
            # Look for HTTP auth (Basic, Bearer)
            elif scheme.get('type') == 'http':
                if scheme.get('scheme') == 'basic':
                    auth_config = {
                        'type': 'basic',
                        'username': '{{username}}',
                        'password': '{{password}}'
                    }
                elif scheme.get('scheme') == 'bearer':
                    auth_config = {
                        'type': 'header',
                        'key': 'Authorization',
                        'value': 'Bearer {{api-key}}'
                    }
                break
    
    return auth_config

def convert_path_to_our_format(path: str) -> str:
    """
    Converts OpenAPI path to our format
    
    Args:
        path: The OpenAPI path (e.g., /twitter/{id})
        
    Returns:
        Our internal path format (e.g., /twitter/id)
    """
    # Remove any path parameters (e.g., /{id} becomes /id)
    import re
    return re.sub(r'\{([^}]+)\}', r'\1', path)

def resolve_schema_references(schema: Dict, openapi_json: Dict) -> Dict:
    """
    Resolves schema references in the OpenAPI JSON
    
    Args:
        schema: The schema object that may contain references
        openapi_json: The full OpenAPI JSON object
        
    Returns:
        The resolved schema object
    """
    if not schema:
        return {}
    
    # If the schema is a reference, resolve it
    if '$ref' in schema:
        ref = schema['$ref']
        if ref.startswith('#/components/schemas/'):
            schema_name = ref.split('/')[-1]
            if 'components' in openapi_json and 'schemas' in openapi_json['components']:
                if schema_name in openapi_json['components']['schemas']:
                    # Get the referenced schema
                    referenced_schema = openapi_json['components']['schemas'][schema_name]
                    # Make a deep copy to avoid modifying the original
                    import copy
                    schema = copy.deepcopy(referenced_schema)
                    # Recursively resolve any nested references
                    schema = resolve_schema_references(schema, openapi_json)
    
    # Process properties recursively
    if 'properties' in schema:
        for prop_name, prop_schema in schema['properties'].items():
            schema['properties'][prop_name] = resolve_schema_references(prop_schema, openapi_json)
    
    # Process array items
    if 'items' in schema:
        schema['items'] = resolve_schema_references(schema['items'], openapi_json)
    
    # Process oneOf, anyOf, allOf
    for key in ['oneOf', 'anyOf', 'allOf']:
        if key in schema:
            for i, sub_schema in enumerate(schema[key]):
                schema[key][i] = resolve_schema_references(sub_schema, openapi_json)
    
    return schema

def cleanup_schema(schema: Dict) -> None:
    """Cleans up schema object to match our format"""
    # Remove unnecessary properties
    if '$ref' in schema:
        del schema['$ref']
    if 'title' in schema:
        del schema['title']
    
    # Process properties recursively
    if 'properties' in schema:
        for prop_name, prop_schema in schema['properties'].items():
            cleanup_schema(prop_schema)
    
    # Process array items
    if 'items' in schema:
        cleanup_schema(schema['items'])
    
    # Process oneOf, anyOf, allOf
    for key in ['oneOf', 'anyOf', 'allOf']:
        if key in schema:
            for sub_schema in schema[key]:
                cleanup_schema(sub_schema)

def generate_example_files(api_yaml: Dict, subnet_dir: str) -> None:
    """
    Generates example files for each endpoint
    
    Args:
        api_yaml: The API YAML object
        subnet_dir: The subnet directory path
    """
    for endpoint in api_yaml.get('endpoints', []):
        # Convert path to directory name
        # Use the path without the leading slash and replace / with -
        # This matches the convention used in the existing examples
        endpoint_name = endpoint['path'].lstrip('/').replace('/', '-')
        endpoint_dir = os.path.join(subnet_dir, 'examples', endpoint_name)
        
        # Create endpoint directory if it doesn't exist
        os.makedirs(endpoint_dir, exist_ok=True)
        
        # Generate request example
        request_example = generate_request_example(endpoint)
        with open(os.path.join(endpoint_dir, 'request.json'), 'w') as f:
            json.dump(request_example, f, indent=2)
        
        # Generate response example from the response schema
        if 'responseSchema' in endpoint:
            response_example = generate_example_from_schema(endpoint['responseSchema'])
        else:
            # If no response schema is available, generate a minimal response
            response_example = {"success": True}
            
        with open(os.path.join(endpoint_dir, 'response.json'), 'w') as f:
            json.dump(response_example, f, indent=2)
        
        print(f"Generated examples for {endpoint['path']}")

def generate_request_example(endpoint: Dict) -> Dict:
    """
    Generates a request example for an endpoint
    
    Args:
        endpoint: The endpoint object from the API YAML
        
    Returns:
        A dictionary representing the request example
    """
    if endpoint['method'] == 'GET':
        # For GET requests, create an object with query parameters
        example = {}
        if 'queryParams' in endpoint:
            for param in endpoint['queryParams']:
                # Always include required parameters
                if param.get('required'):
                    # If the parameter has an example, use it
                    if 'example' in param:
                        example[param['name']] = param['example']
                    # If the parameter has a default value, use it
                    elif 'default' in param:
                        example[param['name']] = param['default']
                    # If the parameter has an enum, use the first value
                    elif 'enum' in param and param['enum']:
                        example[param['name']] = param['enum'][0]
                    # Generate a value based on the parameter type and name
                    elif param.get('type') == 'string':
                        # Use more meaningful examples based on parameter name
                        if param['name'] == 'post_id':
                            example[param['name']] = "1234567890"
                        elif param['name'] == 'user':
                            example[param['name']] = "elonmusk"
                        elif param['name'] == 'query':
                            example[param['name']] = "Whats going on with Bittensor"
                        else:
                            example[param['name']] = f"example-{param['name']}"
                    elif param.get('type') in ['integer', 'number']:
                        if param['name'] == 'count':
                            example[param['name']] = 10
                        else:
                            example[param['name']] = 1
                    elif param.get('type') == 'boolean':
                        example[param['name']] = True
                    elif param.get('type') == 'array':
                        if param['name'] == 'urls':
                            example[param['name']] = ["https://x.com/RacingTriple/status/1892527552029499853"]
                        else:
                            example[param['name']] = ['example-item']
                    else:
                        example[param['name']] = None
                
                # Include some common non-required parameters that are important
                elif param['name'] in ['count', 'query']:
                    if param['name'] == 'count':
                        example[param['name']] = 10
                    elif param['name'] == 'query':
                        example[param['name']] = "latest news on AI"
        
        return example
    else:
        # For POST/PUT requests, generate an example based on the schema
        if 'requestSchema' in endpoint and endpoint['requestSchema']:
            return generate_example_from_schema(endpoint['requestSchema'])
        else:
            return {}


def generate_example_from_schema(schema: Dict) -> Any:
    """
    Generates an example object from a JSON schema
    
    Args:
        schema: The JSON schema object
        
    Returns:
        An example object based on the schema
    """
    if not schema:
        return {}
    
    # If the schema has an example, use it directly
    if 'example' in schema:
        return schema['example']
    
    # If the schema has a default value, use it
    if 'default' in schema:
        return schema['default']
    
    if schema.get('type') == 'object':
        result = {}
        if 'properties' in schema:
            # Check if there are required properties
            required_props = schema.get('required', [])
            
            for prop_name, prop_schema in schema['properties'].items():
                # Check if the property has an example
                if 'example' in prop_schema:
                    result[prop_name] = prop_schema['example']
                # Include required properties
                elif prop_name in required_props:
                    result[prop_name] = generate_example_from_schema(prop_schema)
                # Include common important properties even if not required
                elif prop_name in ['prompt', 'query', 'tools', 'model', 'post_id', 'user', 'id', 'count']:
                    result[prop_name] = generate_example_from_schema(prop_schema)
        return result
    
    if schema.get('type') == 'array':
        if 'items' in schema:
            # If the array items have an example, use it
            if 'example' in schema.get('items', {}):
                return [schema['items']['example']]
            # Otherwise generate an example for the items
            return [generate_example_from_schema(schema['items'])]
        return []
    
    if schema.get('type') == 'string':
        # If there's an enum, use the first value
        if 'enum' in schema and schema['enum']:
            return schema['enum'][0]
        
        # Handle specific string formats
        if schema.get('format') == 'date-time':
            from datetime import datetime
            return datetime.now().isoformat()
        if schema.get('format') == 'date':
            from datetime import datetime
            return datetime.now().date().isoformat()
        if schema.get('format') == 'email':
            return 'user@example.com'
        if schema.get('format') == 'uri':
            return 'https://example.com'
        
        # Check if the property name gives us a hint about what kind of value it should be
        if 'id' in schema.get('title', '').lower() or 'post_id' in schema.get('title', '').lower():
            return "1234567890"
        if 'user' in schema.get('title', '').lower():
            return "elonmusk"
        if 'query' in schema.get('title', '').lower():
            return "Whats going on with Bittensor"
        
        # Default string value
        return 'example'
    
    if schema.get('type') in ['number', 'integer']:
        # If there's an enum, use the first value
        if 'enum' in schema and schema['enum']:
            return schema['enum'][0]
        
        # If it's a count parameter, use a reasonable value
        if 'count' in schema.get('title', '').lower():
            return 10
        
        # Default number value
        return 0
    
    if schema.get('type') == 'boolean':
        return False
    
    return None

if __name__ == "__main__":
    main()
