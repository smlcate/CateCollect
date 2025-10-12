(function () {
  'use strict';
  angular.module('iwApp').factory('Api', function ($http) {
    function get(url, params) { return $http.get('/api' + url, { params: params || {} }); }
    function post(url, body, params) { return $http.post('/api' + url, body, { params: params || {} }); }
    function put(url, body) { return $http.put('/api' + url, body); }
    return { get: get, post: post, put: put };
  });
})();
