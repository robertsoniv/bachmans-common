angular.module('bachmans-common', [

]);
angular.module('bachmans-common')
    .config(OrderCloudSDKAnonAdditions)
;

function OrderCloudSDKAnonAdditions($provide){
    $provide.decorator('OrderCloudSDK', ['$delegate', '$cookies', 'ocAppName', function($delegate, $cookies, ocAppName){
        var cookiePrefix = ocAppName.Watch().replace(/ /g, '_').toLowerCase();
        var anonCookieName = cookiePrefix + 'anonymous.token';
        var impersonationCookieName = cookiePrefix + 'impersonate.token';
        
        // enables use of As(), AsAnon(), and AsAdmin()
        // so that we can easily tell under which context
        // an api call is being made

        $delegate.GetAnonToken = function(){
            return $cookies.get(anonCookieName);
        };

        $delegate.SetAnonToken = function(token){
            $cookies.put(anonCookieName, token);
        };

        $delegate.GetImpersonationToken = function(){
            return $cookies.get(impersonationCookieName);
        };

        $delegate.SetImpersonationToken = function(token){
            $cookies.put(impersonationCookieName, token);
        };

        var originalAs = $delegate.As;

        $delegate.As = function(){
            var impersonationToken = $delegate.GetImpersonationToken();
            return originalAs(impersonationToken);
        };

        $delegate.AsAnon = function(){
            var anonymousToken = $delegate.GetAnonToken();
            return originalAs(anonymousToken);
        };

        $delegate.AsAdmin = function(){
            var adminToken = $delegate.GetToken();
            return originalAs(adminToken);
        };

        return $delegate;
    }]);
}
OrderCloudSDKAnonAdditions.$inject = ['$provide'];
angular.module('bachmans-common')
    .config(OrderCloudSDKBuyerXP);


function OrderCloudSDKBuyerXP($provide){
    $provide.decorator('OrderCloudSDK', ['$delegate', 'ocBuyerXp', '$q', function($delegate, ocBuyerXp, $q){
        $delegate.Buyers.Get = function(){
            var token = $delegate.GetToken();
            return ocBuyerXp.Get(token);
        };

        $delegate.Buyers.Update = function(){
            var update = [].slice.call(arguments)[1]; //update obj is second argument
            var token = $delegate.GetToken();
            if(update && update.xp) {
                return ocBuyerXp.Update(token, update.xp);
            } else {
                return $q.reject('Missing body');
            }
        };

        $delegate.Buyers.Patch = function(){
            var patch = [].slice.call(arguments)[1]; //patch obj is second argument
            var token = $delegate.GetToken();
            if(patch) {
                return ocBuyerXp.Patch(token, patch);
            } else {
                return $q.reject('Missing body');
            }
        };

        return $delegate;
    }]);
}
OrderCloudSDKBuyerXP.$inject = ['$provide'];

angular.module('bachmans-common')
    .factory('bachBuyerXp', bachBuyerXpService)
;

function bachBuyerXpService($q, $http, $interval, nodeapiurl){
    var buyerxpurl = nodeapiurl + '/buyerxp';
    var buyerxp = null;
    var hasBeenCalled = false;
    var service = {
        Get: _get,
        Update: _update,
        Patch: _patch
    };

    function _get(token){
        var dfd = $q.defer();

        if(buyerxp){
            dfd.resolve(buyerxp);
        } else if(hasBeenCalled){
            waitForResponse();
        } else {
            hasBeenCalled = true;
            $http.get(buyerxpurl, {headers: {'oc-token': token}})
                .then(function(response){
                    buyerxp = {xp: response.data};
                    dfd.resolve(buyerxp);
                })
                .catch(function(ex){
                    dfd.reject(ex);
                });
            }

        function waitForResponse(){
            var check = $interval(function(){
                if(buyerxp){
                    $interval.cancel(check);
                    dfd.resolve(buyerxp);
                }
            }, 100);
        }

        return dfd.promise;
    }

    function _update(token, update){
        return $http.put(buyerxpurl, update, {headers: {'oc-token': token}});
    }

    function _patch(patch, token){
        return $http.patch(buyerxpurl, patch, {headers: {'oc-token': token}});
    }

    return service;
}
bachBuyerXpService.$inject = ['$q', '$http', '$interval', 'nodeapiurl'];
angular.module('bachmans-common')
    .factory('bachGiftCards', bachGiftCards)
;

function bachGiftCards(nodeapiurl, $resource, $cookies, ocAppName, toastr){
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
bachGiftCards.$inject = ['nodeapiurl', '$resource', '$cookies', 'ocAppName', 'toastr'];