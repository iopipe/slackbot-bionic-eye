'use strict';

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

// Post message to Slack - https://api.slack.com/methods/chat.postMessage
var handleEvent = function () {
  var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(slackEvent, callback) {
    var result, imageURL, fileExt, imgFilename, imageData, s3putObject, labelText, message, query;
    return _regenerator2.default.wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            // make sure we don't originate from our bot user.
            if (slackEvent.event.bot_id) {
              callback(err);
            }

            result = imgRegex.exec(slackEvent.event.text);

            if (result.length() !== 3) {
              callback(err);
            }

            imageURL = result[1], fileExt = result[2], imgFilename = `${slackEvent.team_id}/${slackEvent.event_id}.`;


            context.iopipe.mark.start('http-request');
            imageData = new Promise(function (resolve, reject) {
              /* TODO: remove callback and assign return value to imageData (it's a stream!) */
              request(imageURL, function (error, response, imageData) {
                context.iopipe.mark.end('http-request');

                if (err) {
                  console.log('error:', error); // Print the error if one occurred
                }
                if (response && response.statusCode !== 200) {
                  console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                }

                resolve(imageData);
              });
            });
            s3putObject = new Promise(function (resolve) {
              context.iopipe.mark.start('s3-putObject');
              s3.putObject({
                Body: imageData,
                Bucket: S3_BUCKET,
                Key: imgFilename
              }, function s3putComplete(err, data) {
                context.iopipe.mark.stop('s3-putObject');
                resolve(err, {
                  Bucket: S3_BUCKET,
                  Name: imgFilename
                });
              });
            });

            labelText = function () {
              var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(resolve) {
                return _regenerator2.default.wrap(function _callee$(_context) {
                  while (1) {
                    switch (_context.prev = _context.next) {
                      case 0:
                        context.iopipe.mark.start('rekognition-detectLabels');
                        _context.t0 = rekognition;
                        _context.next = 4;
                        return s3putObject;

                      case 4:
                        _context.t1 = _context.sent;
                        _context.t2 = {
                          S3Object: _context.t1
                        };
                        _context.t3 = MAX_LABELS;
                        _context.t4 = MIN_CONFIDENCE;
                        _context.t5 = {
                          Image: _context.t2,
                          MaxLabels: _context.t3,
                          MinConfidence: _context.t4
                        };

                        _context.t6 = function rekognizeLabels(err, data) {
                          context.iopipe.mark.stop('rekognition-detectLabels');
                          if (err) {
                            resolve(err, nil);
                          }
                          var text = data.reduce(function reduceLabels(acc, curval) {
                            return `${curval} \`${acc.Name}\``;
                          });
                          resolve(nil, text);
                        };

                        _context.t0.detectLabels.call(_context.t0, _context.t5, _context.t6);

                      case 11:
                      case 'end':
                        return _context.stop();
                    }
                  }
                }, _callee, this);
              }));

              return function labelText(_x3) {
                return _ref2.apply(this, arguments);
              };
            }();

            _context2.t0 = ACCESS_TOKEN;
            _context2.t1 = slackEvent.event.channel;
            _context2.next = 12;
            return labelText();

          case 12:
            _context2.t2 = _context2.sent;
            message = {
              token: _context2.t0,
              channel: _context2.t1,
              text: _context2.t2
            };
            query = qs.stringify(message); // prepare the querystring

            https.get(`https://slack.com/api/chat.postMessage?${query}`);

            callback(null);

          case 17:
          case 'end':
            return _context2.stop();
        }
      }
    }, _callee2, this);
  }));

  return function handleEvent(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

// Lambda handler


function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* Usage:

   set environment variables:
  
   - S3_BUCKET (required)
   - SLACK_VERIFICATION_TOKEN (required)
   - SLACK_ACCESS_TOKEN (required)
   - MIN_CONFIDENCE (default 75)
   - MAX_LABELS (default 10)

*/
//const profilerPlugin = require('iopipe-plugin-profiler');
var tracePlugin = require('iopipe-plugin-trace');
var iopipe = require('iopipe')({
  plugins: [
  //profilerPlugin(),
  tracePlugin()]
});

var https = require('https'),
    qs = require('querystring'),
    AWS = require('aws-sdk'),
    request = require('request'),
    s3 = new AWS.S3({ apiVersion: '2006-03-01' }),
    rekognition = new AWS.Rekognition({ apiVersion: '2016-06-27' });

var imgRegex = /(\S\.(png|jpeg|jpg|jpeg-large|jpg-large))(?:\s+|$)/ig,
    VERIFICATION_TOKEN = process.env.SLACK_VERIFICATION_TOKEN,
    ACCESS_TOKEN = process.env.SLACK_ACCESS_TOKEN,
    S3_BUCKET = process.env.S3_BUCKET,
    MIN_CONFIDENCE = process.env.MIN_CONFIDENCE || 75,
    MAX_LABELS = process.env.MAX_LABELS || 10;

// Verify Url - https://api.slack.com/events/url_verification
function handleVerification(data, callback) {
  if (data.token === VERIFICATION_TOKEN) callback(null, data.challenge);else callback("verification failed");
}exports.handler = iopipe(function (event, context, callback) {
  var slackEvent = JSON.parse(event.body);
  switch (event.type) {
    case "url_verification":
      handleVerification(slackEvent, callback);break;
    case "event_callback":
      handleEvent(slackEvent, callback);break;
    default:
      callback(null);
  }
});