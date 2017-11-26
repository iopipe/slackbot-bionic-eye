/* Usage:

   set environment variables:
  
   - S3_BUCKET (required)
   - SLACK_VERIFICATION_TOKEN (required)
   - SLACK_ACCESS_TOKEN (required)
   - MIN_CONFIDENCE (default 75)
   - MAX_LABELS (default 10)

*/
const profilerPlugin = require('iopipe-plugin-profiler');
const tracePlugin = require('iopipe-plugin-trace');
const iopipe = require('iopipe')({
  plugins: [
    profilerPlugin(),
    tracePlugin()
  ]
});

const https = require('https'),
      qs = require('querystring'),
      AWS = require('aws-sdk'),
      request = require('request'),
      s3 = new AWS.S3({apiVersion: '2006-03-01'}),
      rekognition = new AWS.Rekognition({apiVersion: '2016-06-27'});

const imgRegex = /<(\S+\.(png|jpeg|jpg|jpeg-large|jpg-large)(?:|\?\S+))>/ig,
      VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN,
      ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN,
      S3_BUCKET = process.env.S3_BUCKET,
      MIN_CONFIDENCE = process.env.MIN_CONFIDENCE || 75,
      MAX_LABELS = process.env.MAX_LABELS || 10;

// Verify Url - https://api.slack.com/events/url_verification
function handleVerification(data, callback) {
    var successResponse = {
        "isBase64Encoded": false,
        "statusCode": 200,
        "headers": {
          "Content-type": "application/x-www-form-urlencoded"
        },
        "body": data.challenge
    }
    if (data.token === VERIFICATION_TOKEN) {
      console.log("Verification successful: " + JSON.stringify(successResponse))
      return callback(null, successResponse);
    } else {
      console.log("Verification failed.")
      return callback(null, { "statusCode": 400 });
    }
}

// Post message to Slack - https://api.slack.com/methods/chat.postMessage
async function handleEvent(slackEvent, context, callback) {
  const httpSuccess = { "statusCode": 200 }

  console.log("Slack event:\n")
  console.log(JSON.stringify(slackEvent))

  // make sure we don't originate from our bot user.
  if (slackEvent.event.bot_id) {
    console.log("Bot user message... ignoring")
    return callback(null, httpSuccess);
  }

  const result = imgRegex.exec(slackEvent.event.text);
  if (!result || (result && result.length !== 3)) {
    console.log("No image found in text.")
    console.log(JSON.stringify(result))
    return callback(null, httpSuccess)
  }

  const imageURL = result[1],
        fileExt = result[2],
        imgFilename = `${slackEvent.team_id}/${slackEvent.event_id}.${fileExt}`;

  // context.iopipe.mark.start('http-request')
  const imageData = new Promise((resolve, reject) => {
    /* TODO: remove callback and assign return value to imageData (it's a stream!) */
    request({
      url: imageURL,
      encoding: null
    }, function (err, response, imageData) {
      // context.iopipe.mark.end('http-request')

      if (err) {
        console.log('error:', err); // Print the error if one occurred
        return resolve([err])
      }
      if (response && response.statusCode !== 200) {
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      }

      const contentType = ('content-type' in response.headers) ? response.headers['content-type'] : `image/${fileExt}`
      return resolve([null, imageData, contentType]);
    });
  })

  const s3putObject = new Promise(async function (resolve) {
    // context.iopipe.mark.start('s3-putObject')
    var imgResponse = await imageData

    /* handle error*/
    if (!imgResponse || imgResponse[0]) {
      return resolve([imgResponse])
    }
    s3.putObject({
      Body: imgResponse[1],
      Bucket: S3_BUCKET,
      Key: imgFilename,
      ContentType: imgResponse[2]
    }, function s3putComplete(err, data) {
      // context.iopipe.mark.stop('s3-putObject')
      return resolve([err, {
        Bucket: S3_BUCKET,
        Name: imgFilename
      }]);
    });
  });

  const labelText = new Promise(async function (resolve) {
    // context.iopipe.mark.start('rekognition-detectLabels')
    var s3object = await s3putObject
    /* handle error*/
    if (!s3object || s3object[0]) {
      return resolve([s3object])
    }   
    rekognition.detectLabels({
      Image: {
       S3Object: s3object[1]
      }, 
      MaxLabels: MAX_LABELS,
      MinConfidence: MIN_CONFIDENCE
    }, function rekognizeLabels(err, data) {
      // context.iopipe.mark.stop('rekognition-detectLabels')
      if (err) {
        console.log("Error in rekognize: \n")
        console.log(err)
        console.log("s3 object: \n")
        console.log(s3object[1])
        return resolve([err]);
      }
      var text;
      if (data["Labels"].length > 0) {
        text = data["Labels"].reduce(function reduceLabels(acc, curval) {
          return `\`${curval['Name']}\` ${(typeof(acc) === 'object') ? "\`"+acc['Name']+"\`" : acc}`
        });
      } else {
        text = "I did not recognize anything in this object. Sorry!"
      }
      console.log(`rekognized labels: ${text}`);
      return resolve([null, text]);
    })
  })

  /* Decide if message is in channel or thread, thread appropriately. */
  var thread;
  if (slackEvent.event.thread_ts) {
    thread = slackEvent.event.thread_ts;
  } else {
    thread = slackEvent.event.ts;
  }

  const message = { 
      token: ACCESS_TOKEN,
      channel: slackEvent.event.channel,
      reply_broadcast: false,
      thread_ts: thread,
      text: await labelText
  };

  const query = qs.stringify(message); // prepare the querystring
  https.get(`https://slack.com/api/chat.postMessage?${query}`);

  return callback(null, { "statusCode": 200 });
}

// Lambda handler
exports.handler = iopipe((event, context, callback) => {
    const slackEvent = JSON.parse(event.body);
    switch (slackEvent.type) {
        case "url_verification": handleVerification(slackEvent, callback); break;
        case "event_callback": handleEvent(slackEvent, context, callback); break;
        default: callback(null);
    }
});
