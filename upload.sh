source '.env'
zip -r lambda.zip . -x ./.git/**\* ./.gitignore
aws s3 cp lambda.zip $S3_BUCKET
aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --runtime nodejs12.x \
    --environment "Variables={REDIS_URL=${REDIS_URL}}" \
    --role $LAMBDA_ROLE
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file "fileb://lambda.zip" \
    --publish