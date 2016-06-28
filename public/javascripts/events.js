'use strict';

$('body').submit(function(event) {
  var form, path, url;

  event.preventDefault();
  form = $('form');
  path = form.attr('action');

  console.log(url);

  $.post(
    path,
    function(data, status) {
      var newToken, action;

      console.log(data);

      newToken = data.token;
      action = data.action;
      window.sessionStorage.setItem( 'token', newToken );

      alert('URL tracker is working.');

      $.post(
        '/api/' + action + '?token=' + newToken,
        function(data, status) {
          console.log(status);
        })
        .fail(function(jq, status, error) {
          console.log(error);
        });
    })
    .fail(function(jq, status, error) {
      alert('URL tracker has the following error: ' + error);
  });
});