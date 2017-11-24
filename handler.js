/* Usage:

   set environment variables:
  
   - SLACK_VERIFICATION_TOKEN
   - SLACK_ACCESS_TOKEN
*/

const https = require('https'),
      qs = require('querystring'),
      aws = require('aws-sdk'),
      request = require('request'),
      VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN,
      ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN,
      MIN_CONFIDENCE = process.env.MIN_CONFIDENCE,
      MAX_LABELS = process.env.MAX_LABELS;

const s3 = new AWS.S3({apiVersion: '2006-03-01'}),
      rekognition = new AWS.Rekognition({apiVersion: '2016-06-27'});

const imgRegex = /(\S\.(png|jpeg|jpg|jpeg-large|jpg-large))(?:\s+|$)/ig


// Verify Url - https://api.slack.com/events/url_verification
function handleVerification(data, callback) {
    if (data.token === VERIFICATION_TOKEN) callback(null, data.challenge);
    else callback("verification failed");   
}

// Post message to Slack - https://api.slack.com/methods/chat.postMessage
function handleEvent(slackEvent, callback) {
  // make sure we don't originate from our bot user.
  if (slackEvent.event.bot_id) {
    callback(err);
  }

  const result = imgRegex.exec(slackEvent.event.text));
  if (result.length() !== 3) {
    callback(err)
  }

  const imageURL = result[1],
        fileExt = result[2],
        imgFilename = `${slackEvent.team_id}/${slackEvent.event_id}.`;

  context.iopipe.mark.start('http-request')
  const imageData = new Promise((resolve, reject) => {
    /* TODO: remove callback and assign return value to imageData (it's a stream!) */
    request(imageURL, function (error, response, imageData) {
      context.iopipe.mark.end('http-request')

      if (err) {
        console.log('error:', error); // Print the error if one occurred
      }
      if (response && response.statusCode !== 200) {
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      }

      resolve(imageData);
    });
  })

  const s3putObject = new Promise((resolve, reject) => {
    context.iopipe.mark.start('s3-putObject')
    s3.putObject({
      Body: imageData,
      Bucket: process.env.S3_BUCKET,
      Key: imgFilename 
    }, function s3putComplete(err, data) {
      context.iopipe.mark.stop('s3-putObject')
      resolve({
        Bucket: process.env.S3_BUCKET,
        Name: imgFilename
      });
    });
  });

  const labelText = new Promise((resolve, reject) => {
    context.iopipe.mark.start('rekognition-detectLabels')
    rekognition.detectLabels({
      Image: {
       S3Object: await s3putObject();
      }, 
      MaxLabels: MAX_LABELS,
      MinConfidence: MIN_CONFIDENCE
    }, function rekognizeLabels(err ,data) {
      context.iopipe.mark.stop('rekognition-detectLabels')
      if (err) {
        reject(err);
      }
      const text = data.reduce(function reduceLabels(acc, curval) {
        return `${curval} \`${acc.Name}\``
      });
      resolve(text);
    })
  })

  const message = { 
      token: ACCESS_TOKEN,
      channel: slackEvent.event.channel,
      text: await labelText()
  };

  const query = qs.stringify(message); // prepare the querystring
  https.get(`https://slack.com/api/chat.postMessage?${query}`);

  callback(null);       
}

// Lambda handler
exports.handler = (event, context, callback) => {
    switch (event.type) {
        case "url_verification": handleVerification(event, callback); break;
        case "event_callback": handleEvent(event, callback); break;
        default: callback(null);
    }
};
