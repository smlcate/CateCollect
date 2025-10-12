(function () {
  'use strict';
  angular.module('iwApp').factory('UploadSvc', function ($q) {
    function uploadDoc(opts) {
      // opts: { claim_number, type, file }
      var fd = new FormData();
      fd.append('claim_number', opts.claim_number);
      fd.append('type', opts.type);
      fd.append('file', opts.file);

      var d = $q.defer();
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/uploads');

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) d.notify({ loaded: e.loaded, total: e.total, pct: Math.round((e.loaded / e.total) * 100) });
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { d.resolve(JSON.parse(xhr.responseText)); } catch (_) { d.resolve({}); }
        } else {
          try { d.reject(JSON.parse(xhr.responseText)); } catch (_) { d.reject({ error: 'Upload failed' }); }
        }
      };
      xhr.onerror = function () { d.reject({ error: 'Network error' }); };

      xhr.send(fd);
      return d.promise;
    }
    return { uploadDoc: uploadDoc };
  });
})();
