var auth, postmarkKey, postmark, pmClient, self;

auth = require('../config/auth.js');
postmarkKey = auth.postmark_key;
postmark = require('postmark');
pmClient = new postmark.Client(postmarkKey);

self = module.exports = {

  sendNotification: function (req, res) {
    var receivers, receiversEmails;

    receivers = req.emailList;
    receiversEmails = receivers.join(', ');

    pmClient.sendEmail({
      'From': 'search.melbourne@mediacom.com',
      'To': receiversEmails,
      'Subject': 'Check URL Errors',
      'TextBody': 'Check which URLs have changed, and which have errors here:' +
        '\nhttps://docs.google.com/spreadsheets/d/' + auth.doc_id
      },
      function (err, to) {
        if (err) {
          console.log(err);
          return next();
        }

        console.log('Email sent to: ' + to);
        return next();
      }
    );
  }
};
