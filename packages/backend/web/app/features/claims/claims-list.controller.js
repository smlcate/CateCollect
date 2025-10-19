(function () {
  'use strict';
  angular.module('iwApp').controller('ClaimsListCtrl', function ($http, $location) {
    var vm = this;
    vm.loading = true;
    vm.q = '';
    vm.claims = [];
    vm.carriers = [];
    vm.filter = { carrier_id: '' };

    vm.globalQ = '';
    vm.searching = false;

    // near top of controller
    vm.showIncompleteOnly = false;

    // helper: is claim complete?
    vm.isComplete = function (id) {
      var s = vm.summ[id];
      return !!(s && s.total > 0 && s.done === s.total);
    };

    // filtered list for ng-repeat (respects search + carrier filter + incomplete toggle)
    vm.filteredClaims = function () {
      var list = (vm.claims || []).filter(vm.matches);
      if (!vm.showIncompleteOnly) return list;
      return list.filter(function (c) { return !vm.isComplete(c.id); });
    };


    // id -> { done, total, missing: [] }
    vm.summ = {};

    vm.load = function () {
      vm.loading = true;
      var params = {};
      if (vm.filter.carrier_id) params.carrier_id = vm.filter.carrier_id;

      return $http.get('/api/claims', { params: params })
        .then(function (res) { vm.claims = res.data || []; })
        .then(function () {
          // Batch fetch summaries
          return $http.get('/api/claims/summaries')
            .then(function (r) {
              var m = {};
              (r.data || []).forEach(function (row) {
                m[row.id] = { done: row.done, total: row.total, missing: row.missing || [] };
              });
              vm.summ = m;
              // after vm.summ = m; in the summaries load
              vm.incompleteCount = (vm.claims || []).reduce(function (acc, c) {
                var s = m[c.id];
                if (!s) return acc;
                var incomplete = (s.total > 0 && s.done < s.total) || (s.total === 0); // treat 0/0 as attention
                return acc + (incomplete ? 1 : 0);
              }, 0);

              // helper if you want to keep it dynamic as filters change:
              vm.incompleteVisibleCount = function () {
                return (vm.filteredClaims ? vm.filteredClaims() : vm.claims || []).filter(function (c) {
                  var s = vm.summ[c.id]; if (!s) return false;
                  return (s.total > 0 && s.done < s.total) || (s.total === 0);
                }).length;
              };
            });
        })
        .finally(function () { vm.loading = false; });
    };

    vm.loadCarriers = function () {
      return $http.get('/api/carriers').then(function (r) {
        vm.carriers = r.data || [];
      });
    };

    vm.open = function (id) { $location.path('/claims/' + id); };
    vm.newClaim = function () { $location.path('/claims/new'); };

    vm.matches = function (c) {
      if (!vm.q) return true;
      var s = (vm.q || '').toLowerCase();
      return String(c.claim_number).toLowerCase().includes(s) ||
             String(c.customer_name || '').toLowerCase().includes(s) ||
             String(c.carrier_name || '').toLowerCase().includes(s);
    };

    vm.summText = function (id) {
      var s = vm.summ[id];
      return s ? (s.done + '/' + s.total) : '—';
    };

    vm.missingText = function (id) {
      var s = vm.summ[id];
      return s && s.missing && s.missing.length
        ? ('Missing: ' + s.missing.join(', '))
        : 'All required docs present';
    };

    vm.isComplete = function (id) {
      var s = vm.summ[id]; return !!(s && s.done === s.total && s.total > 0);
    };

    // search across all, respecting archived toggle on the page (reuse showIncompleteOnly if you like)
    vm.searchAll = function () {
      vm.searching = true;
      var arch = vm.showArchived ? 'true' : 'false'; // add showArchived toggle if desired
      var params = { q: vm.globalQ };
      if (typeof vm.showArchived !== 'undefined') params.archived = arch;
      return $http.get('/api/claims/search', { params: params })
        .then(function (r) { vm.claims = r.data || []; })
        .then(function () { return $http.get('/api/claims/summaries'); })
        .then(function (r) {
          var m = {};
          (r.data || []).forEach(function (row) { m[row.id] = { done: row.done, total: row.total, missing: row.missing || [] }; });
          vm.summ = m;
        })
        .finally(function () { vm.searching = false; });
    };

    vm.loadCarriers().then(vm.load);
  });
})();
