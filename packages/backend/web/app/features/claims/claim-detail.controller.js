(function () {
  'use strict';
  angular.module('iwApp').controller('ClaimDetailCtrl', function ($http, $routeParams, Api, UploadSvc) {
    var vm = this;
    vm.id = $routeParams.id;
    vm.loading = true;
    vm.claim = null;
    vm.checklist = null;
    vm.documents = [];
    vm.summary = { total: 0, done: 0 };

    vm.up = { type: '' };
    vm.upErr = '';
    vm.upLoading = false;
    vm.upPct = 0;

    // add state
    vm.archiving = false;
    vm.notes = [];
    vm.newNote = '';

    // state
    vm.events = [];
    vm.eventsLoading = false;

    // load events
    function loadEvents() {
      vm.eventsLoading = true;
      return $http.get('/api/claims/' + vm.id + '/events')
        .then(function (r) { vm.events = r.data || []; })
        .finally(function () { vm.eventsLoading = false; });
    }
    // load notes
    function loadNotes() {
      return $http.get('/api/claims/' + vm.id + '/notes').then(function (r) { vm.notes = r.data || []; });
    }

    // toggle archive
    vm.setArchived = function (val) {
      vm.archiving = true;
      $http.put('/api/claims/' + vm.id + '/archive', { archived: !!val })
        .then(function () { vm.claim.archived = !!val; })
        .finally(function () { vm.archiving = false; });
    };

    // add note
    vm.addNote = function () {
      var t = (vm.newNote || '').trim();
      if (!t) return;
      $http.post('/api/claims/' + vm.id + '/notes', { note: t })
        .then(function (r) { vm.notes.unshift(r.data); vm.newNote=''; });
    };

    function computeSummary() {
      if (!vm.checklist) { vm.summary = { total: 0, done: 0 }; return; }
      var total = (vm.checklist.required || []).length;
      var done = (vm.checklist.present || []).length;
      vm.summary = { total: total, done: done };
    }

    function load() {
      vm.loading = true;
      return Api.get('/claims/' + vm.id).then(function (res) {
        vm.claim = res.data;
      }).then(function () {
        return Api.get('/claims/' + vm.id + '/checklist');
      }).then(function (res) {
        vm.checklist = res.data;
        computeSummary();
      }).then(function () {
        return Api.get('/documents', { claim_id: vm.id });
      }).then(function (res) {
        vm.documents = res.data || [];
      })
      .then(loadNotes)
      .then(loadNotes)
      .then(loadEvents)
      .finally(function () { vm.loading = false; });

    }

    // optional: humanize event
    vm.eventText = function (ev) {
      var d = ev.detail || {};
      switch (ev.type) {
        case 'claim_created': return 'Claim created';
        case 'claim_archived': return 'Claim archived';
        case 'claim_unarchived': return 'Claim unarchived';
        case 'doc_uploaded': return 'File uploaded: ' + (d.type || '?') + (d.original ? (' (' + d.original + ')') : '');
        case 'doc_registered':
          if (d.bulk) return 'Documents registered (bulk x' + (d.count || 0) + '): ' + (d.types || []).join(', ');
          return 'Document registered: ' + (d.type || '?') + (d.filename ? (' (' + d.filename + ')') : '');
        case 'note_added': return 'Note added';
        default: return ev.type;
      }
    };

    vm.hasDoc = function (type) {
      var t = String(type || '').toLowerCase();
      var present = (vm.checklist && vm.checklist.present || []).map(function (x){return String(x).toLowerCase();});
      return present.indexOf(t) !== -1;
    };

    vm.upload = function () {
      vm.upErr = '';
      var fileEl = document.getElementById('fileInput');
      if (!fileEl || !fileEl.files || !fileEl.files[0]) { vm.upErr = 'Choose a file first'; return; }
      if (!vm.up.type) { vm.upErr = 'Type is required'; return; }

      vm.upLoading = true; vm.upPct = 0;
      UploadSvc.uploadDoc({ claim_number: vm.claim.claim_number, type: vm.up.type, file: fileEl.files[0] })
        .then(function () {
          fileEl.value = ''; vm.up.type = '';
          return Api.get('/documents', { claim_id: vm.id });
        })
        .then(function (res) { vm.documents = res.data || []; })
        .then(function () { return Api.get('/claims/' + vm.id + '/checklist'); })
        .then(function (res) { vm.checklist = res.data; computeSummary(); })
        .catch(function (e) { vm.upErr = (e && e.error) || 'Upload failed'; })
        .finally(function () { vm.upLoading = false; });
    };

    // progress hook
    // Angular $q notify is handled by .then(success, error, notifyCb)
    UploadSvc.uploadDocProgressHook = function (p) { vm.upPct = p.pct || 0; };

    // Hack: subscribe to notify events via factory promise pattern
    // (We already wired notify in the factory; reflect via vm.upPct during upload)
    (function attachNotifyPatch(){
      var orig = UploadSvc.uploadDoc;
      UploadSvc.uploadDoc = function(opts){
        var prom = orig(opts);
        prom.then(null, null, function(n){ vm.upPct = n.pct || 0; });
        return prom;
      };
    })();

    load();
  });
})();
