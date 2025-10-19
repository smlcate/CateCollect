(function () {
  'use strict';
  angular.module('iwApp')
    .config(function ($routeProvider, $locationProvider) {
      $routeProvider
        .when('/', {
          templateUrl: 'app/features/claims/claims-list.html',
          controller: 'ClaimsListCtrl',
          controllerAs: 'vm'
        })
        .when('/claims/new', {
          templateUrl: 'app/features/claims/new-claim.html',
          controller: 'NewClaimCtrl',
          controllerAs: 'vm'
        })
        .when('/claims/:id', {
          templateUrl: 'app/features/claims/claim-detail.html',
          controller: 'ClaimDetailCtrl',
          controllerAs: 'vm'
        })
        .otherwise({ redirectTo: '/' });

      $locationProvider.hashPrefix('!');
    });
})();
