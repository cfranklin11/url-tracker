'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _auth = require('../config/auth.js');

var _auth2 = _interopRequireDefault(_auth);

var _postmark = require('postmark');

var _postmark2 = _interopRequireDefault(_postmark);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var postmark_key = _auth2.default.postmark_key;
var doc_id = _auth2.default.doc_id;

var pmClient = new _postmark2.default.Client(postmark_key);

// Send notification e-mail
function sendNotification(req, res, next) {
  var emailList = req.emailList;


  if (emailList) {
    var receiversEmails = emailList.join(', ');

    pmClient.sendEmail({
      'From': 'search.melbourne@mediacom.com',
      'To': receiversEmails,
      'Subject': 'Check URL Errors',
      'TextBody': 'Check which URLs have changed, and which have errors here:' + '\nhttps://docs.google.com/spreadsheets/d/' + doc_id
    }, function (err, to) {
      if (err) {
        console.log(err);
        next();
      }

      console.log('E-mail sent to: ');
      console.log(to);
      next();
    });
  } else {
    console.log('No e-mail addresses');
    next();
  }
}

exports.default = sendNotification;