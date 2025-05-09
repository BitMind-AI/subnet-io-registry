# Subnet I/O Registry

This repository serves as a central registry for Bittensor subnet API definitions used by the BitMind Intelligence Oracle.

## Adding a New Subnet

**NOTE:** Subnets must have a public API endpoint that can be accessed by the BitMind Intelligence Oracle.

To add a new subnet to the registry:

1. Create a new directory under `subnets/` with your subnet UID as the name

   ```bash
   mkdir -p subnets/<subnet-id>/examples
   ```

2. Create an `api.yml` file in your subnet directory using this format:

   ```yaml
   baseUrl: "https://your-api-endpoint.com"
   endpoints:
     - path: /endpoint-path # Used as the path for the BitMind Intelligence Oracle API endpoint
       externalPath: /external-path # Must match the public API endpoint
       method: POST # HTTP method (GET, POST, PUT, DELETE)
       summary: "Summary of the endpoint"
       description: "Description of the endpoint"
       auth:
         type: header
         key: "Authorization"
         value: "{{api-key}}"
       headers:
         Content-Type: application/json
       requestSchema:
         type: object
         properties:
           param1:
             type: string
             description: "Description of parameter"
           # Add other parameters
         required: [param1]
       # Optional response schema
       responseSchema:
         type: object
         properties:
           result:
             type: string
             description: "Description of result"
   ```

3. Add example request/response pairs in the `examples/` directory for each endpoint:

   ```
   subnets/<subnet-id>/examples/<endpoint_path>/request.json
   subnets/<subnet-id>/examples/<endpoint_path>/response.json
   ```

4. Create and push a feature branch for your changes

5. Test your changes locally before submitting a PR

6. Validate your OpenAPI specification using the ReadMe.io validator (see [docs/README.md](docs/README.md) for detailed instructions)

7. Submit a pull request to the `staging` branch with your changes

## Removing a Subnet

To remove a subnet from the registry:

1. Delete the subnet directory:

   ```bash
   rm -rf subnets/<subnet-id>
   ```

2. Create a feature branch for the removal

3. Submit a pull request to the `staging` branch with the removal

## Updating Subnet Information

To update subnet API definitions:

1. If replacing an existing subnet entirely, simply replace the contents of the existing directory
2. If making updates, edit the `api.yml` file in your subnet directory
3. Update any examples as needed
4. Create a feature branch for your changes
5. Submit a pull request to the `staging` branch with your changes

## API Definition Format

The `api.yml` files follow a standard format that includes:

- `baseUrl`: The base URL for all endpoints
- `endpoints`: An array of endpoint definitions including:
  - `path`: The path for the BitMind Intelligence Oracle API endpoint
  - `externalPath`: The path for the public API endpoint
  - `method`: HTTP method
  - `summary`: Summary of the endpoint
  - `description`: Description of the endpoint
  - `auth`: Authentication requirements
  - `headers`: Required headers
  - `requestSchema`: JSON Schema for the request payload
  - `responseSchema`: JSON Schema for the response (optional)
