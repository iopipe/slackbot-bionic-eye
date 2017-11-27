# Slack Image Descriptions

Describes images posted into Slack, setting descriptions
as image comments. 

Utilizes AWS Lambda, AWS Rekognition, and the Slack Events API.

# Installation & configuration

## Prepare Slack:

1. [Register a Slack application](https://api.slack.com/apps?new_app=1)
2. Create a "bot user" inside your Slack application.
3. Obtain your _Verification Token_ from the "Basic Information" tab.
4. Obtain the _Bot User OAuth Access Token_ from the "OAuth & Permissions" tab.

The _Verification Token_ and _Bot User OAuth Access Token_ will be necessary for
configuring the serverless function.

## Configure and deploy the function:

1. Clone the repo, install deps, and compile:

```
$ git clone https://github.com/iopipe/slackbot-bionic-eye
$ cd slackbot-bionic-eye
$ npm install
$ npm run babel
```

2. Modify the configuration file `config.local.yml`:

Set the Slack _Verification Token_ and _Access Token_ variables
as found in your Slack app configuration.

```
SLACK_VERIFICATION_TOKEN: '<token>'
SLACK_ACCESS_TOKEN: '<token>'
```

Optionally, register for [IOpipe](https://www.iopipe.com/) for observability and profiling tools,
then provide the `IOPIPE_TOKEN` variable. The `IOPIPE_ENABLE_PROFILER` flag if true, will add profiling data.

_Note_: the `config.local.yml` is _not_ included in the uploaded source code to protect your secrets!

3. Deploy!

### Using the serverless framework:

```$ sls deploy```

### _Alternative_, using AWS SAM:

```
$ DEPLOY_BUCKET=bioniceye-deployment-$RANDOM
$ aws s3 mb s3://$DEPLOY_BUCKET
$ sls sam export -o template.yml
$ sam package --template-file template.yml --output-template-file packaged.template.yml --s3-bucket $DEPLOY_BUCKET
$ sam deploy --template-file packaged.template.yml --stack-name slackbot-bionic-eye
```

## Create bucket & update IAM permissions

Currently, users *must* update the role for their lambda function to
include access to S3 and Rekognition manually.

1. Create the bucket specified in your config.local.yml
2. Add permission to your S3 bucket and to write to the AWS Rekognition service!

## Register for Slack events

The deployment step will provide a URL we will give to Slack to register for
events.

1. Pick _Event Subscriptions_ from the Slack app page.
2. Add the _Request URL_ as provided from the output of `$ sls deploy`
3. Subscribe to Workspace Events: `message.channels`, `message.groups`
4. Make sure you toggle the _Enable Events_ flag into the "On" position!

## Test & use it!

This bot should create threaded replies to image _links_ posted to Slack. Caution, it does
not _yet_ support file uploads. Enjoy!

# Copyright

2017 IOpipe, Inc.
Licensed under the Apache 2.0 license.
