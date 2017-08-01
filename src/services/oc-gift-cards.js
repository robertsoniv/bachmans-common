angular.module('orderCloud')
    .factory('ocGiftCards', ocGiftCards)
;

function ocGiftCards(nodeapiurl, $resource, $cookies, ocAppName, toastr){
    var service = {
        Create: _create,
        Update: _update,
        Delete: _delete,
        List: _list
    };

    function _create(req){
        return GiftCards().create(req).$promise;
    }

    function _update(req){
        if(!req.body && !req.body.id) return toastr.error('id is a required parameter');
        return GiftCards().update({id: req.body.id}, req.body).$promise;
    }

    function _delete(req){
        return GiftCards().delete({id: req.id}).$promise;
    }

    function _list(req){
        return GiftCards().list(req && req.searchTerm ? {searchTerm: req.searchTerm} : null).$promise
            .then(function(results){
                return results.list;
            });
    }
    
    function GiftCards(){
        var methods = {
            create: {method: 'POST'},
            update: {method: 'PUT'},
            delete: {method: 'DELETE'},
            list: {method: 'GET'}
        };
        _.each(methods, function(method){
            method.headers = {
                'oc-token': getToken()
            };
        });

        return $resource(nodeapiurl + '/giftcards/:id', {}, methods);
    }

    function getToken(){
        var cookiePrefix = ocAppName.Watch().replace(/ /g, '_').toLowerCase();
        var authTokenCookieName = cookiePrefix + '.token';
        return $cookies.get(authTokenCookieName);
    }

    return service;
}