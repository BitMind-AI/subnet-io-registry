docker run -d -p 8080:8080 \
           -v ${PWD}/openapi.json:/openapi.json \
           -e SWAGGER_JSON=/openapi.json \
           docker.swagger.io/swaggerapi/swagger-ui