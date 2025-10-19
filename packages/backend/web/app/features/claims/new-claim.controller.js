(function () {
  'use strict';
  angular.module('iwApp').controller('NewClaimCtrl', function ($http, $location) {
    var vm = this;
    vm.saving = false;
    vm.carriers = [];
    vm.form = { claim_number: '', customer_name: '', carrier_name: '', status: 'Intake' };
    vm.err = '';

    vm.loadCarriers = function () {
      return $http.get('/api/carriers').then(function (res) {
        vm.carriers = res.data || [];
      });
    };

    vm.submit = function () {
      vm.err = '';
      if (!vm.form.claim_number || !vm.form.carrier_name) {
        vm.err = 'Claim # and Carrier are required.'; return;
      }
      vm.saving = true;
      $http.post('/api/claims', vm.form)
        .then(function (res) { $location.path('/claims/' + res.data.id); })
        .catch(function (e) { vm.err = (e.data && e.data.error) || 'Failed to create claim'; })
        .finally(function () { vm.saving = false; });
    };

    vm.loadCarriers();
  });
})();
