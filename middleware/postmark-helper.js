var auth, postmarkKey, postmark, pmClient, self;

auth = require('../config/auth.js');
postmarkKey = auth.postmark_key;
postmark = require('postmark');
pmClient = new postmark.Client(postmarkKey);

postmarkHelper = self = {

  // Send notification e-mail
  sendNotification: function (req, res, next) {
    var receivers, receiversEmails;

    if (req.emailList) {
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

          console.log('E-mail sent to: ');
          console.log(to);
          return next();
      });

    } else {
      console.log('No e-mail addresses');
      return next();
    }
  }
};

module.exports = postmarkHelper;
