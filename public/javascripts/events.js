'use strict';

$('form').submit(function(event) {
  var form, path, url;

  event.preventDefault();
  form = $(this);
  path = form.attr('action');

  // Make initial POST call to get JWT from server side
  $.post(
    path,
    function(data, status) {
      var newToken, action;

      newToken = data.token;
      action = data.action;
      alert('URL tracker is running.');

      // Make second POST call to begin crawling. Attach JWT with short
      // lifespan to prevent parallel crawling processes (expired JWTs
      // won't repeat the process that's already running)
      $.post(
        '/api/crawl?token=' + newToken,
        form.serialize(),
        function(data, status) {
        })
        .fail(function(jq, status, error) {
          alert('URL tracker has the following error: ' + error);
        });
    })
    .fail(function(jq, status, error) {
      alert('URL tracker has the following error: ' + error);
  });
});