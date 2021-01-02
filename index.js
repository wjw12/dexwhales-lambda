const AWS = require('aws-sdk');
const redis = require("redis");
const client = redis.createClient(process.env.REDIS_URL);
const { promisify } = require("util");
const removeRangeByScore = promisify(client.zremrangebyscore).bind(client);
const getRangeByScore = promisify(client.zrangebyscore).bind(client);
const setItem = promisify(client.hset).bind(client);
const getItem = promisify(client.hget).bind(client);
const getAll = promisify(client.hgetall).bind(client);
const { v4: uuidv4 } = require('uuid');

const TIME_WINDOW = 24 * 60 * 60; // 24 hours

/**
 * Demonstrates a simple HTTP endpoint using API Gateway. You have full
 * access to the request and response payload, including headers and
 * status code.
 *
 * To scan a DynamoDB table, make a GET request with the TableName as a
 * query string parameter. To put, update, or delete an item, make a POST,
 * PUT, or DELETE request respectively, passing in the payload to the
 * DynamoDB API as a JSON body.
 */
exports.handler = async (event, context) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));

    let body;
    let statusCode = '200';
    const headers = {
        'Content-Type': 'application/json',
        "Access-Control-Allow-Headers" : "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
        "Access-Control-Allow-Credentials": "true"
    };

    try {
        switch (event.httpMethod) {
            // case 'DELETE':
            //     body = await dynamo.delete(JSON.parse(event.body)).promise();
            //     break;
            case 'OPTIONS':
                body = ""
            case 'GET':
                //body = await dynamo.scan({ TableName: event.queryStringParameters.TableName }).promise();
                var params = event.queryStringParameters;
                if (!params) params = {}
                var now = Math.floor(Date.now() / 1000);
                var to_timestamp = parseInt(params.to_timestamp) || now;
                if (isNaN(to_timestamp)) to_timestamp = now;
                
                var from_timestamp = parseInt(params.from_timestamp) || 0;
                
                // use last access time if client_id is present
                if (params.client_id) {
                    from_timestamp = await getItem("client_id", params.client_id);
                    await setItem("client_id", params.client_id, now);
                    console.log(params.client_id, from_timestamp, to_timestamp);
                }
                
                if (!from_timestamp || isNaN(from_timestamp) || from_timestamp < now - TIME_WINDOW) from_timestamp = now - TIME_WINDOW;
                
                // get token list
                if (params.token_list) {
                    var allTokens = await getAll('token_list');
                    var response = [];
                    for (var address of Object.keys(allTokens)) {
                        var tokenData = JSON.parse(allTokens[address]);
                        if (tokenData.lastSeen > now - TIME_WINDOW) {
                            response.push({symbol: tokenData.symbol, address: address});
                        }
                    }
                    // return a sorted list of tokens
                    response.sort(function(a, b) {
                          var nameA = a.symbol.toUpperCase(); 
                          var nameB = b.symbol.toUpperCase(); 
                          if (nameA < nameB) {
                            return -1;
                          }
                          if (nameA > nameB) {
                            return 1;
                          }
                        
                          return 0;
                    });
                    body = response;
                    break;
                }
                
                var tableName = "dex_watch_whale";
                
                // remove timestamp out of range data
                var cutoffTime = now - TIME_WINDOW;
                await removeRangeByScore([tableName, 0, cutoffTime]);
                
                var actions = await getRangeByScore([tableName, from_timestamp, to_timestamp]);
                body = actions;
                
                
                // body = await dynamo.scan({ 
                //     TableName: tableName, 
                //     KeyConditionExpression: `#ts BETWEEN :from AND :to`,
                //     ExpressionAttributeNames: {
                //         "#ts": "timestamp", // timestamp is reserved keyword
                //     },
                //     ExpressionAttributeValues: {
                //         ":from": from_timestamp,
                //         ":to": to_timestamp
                //     }
                    
                // }).promise();
                break;
            case 'POST':
                // create new uuid for the client
                var id = uuidv4();
                await setItem("client_id", id, 0);
                body = id;
                break;
            default:
                throw new Error(`Unsupported method "${event.httpMethod}"`);
        }
    } catch (err) {
        statusCode = '400';
        body = err.message;
    } finally {
        body = JSON.stringify(body);
    }

    return {
        statusCode,
        body,
        headers,
    };
};
