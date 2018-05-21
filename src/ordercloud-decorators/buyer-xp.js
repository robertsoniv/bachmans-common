angular.module('bachmans-common')
    .config(OrderCloudSDKBuyerXP);


function OrderCloudSDKBuyerXP($provide){
    $provide.decorator('OrderCloudSDK', function($delegate, $resource, $q, blobstorageurl, bachmansIntegrationsUrl){
        $delegate.Buyers.Get = function(){
            return $resource(blobstorageurl + '/buyerxp.json', {'guid': guid()}, {call: {
                method: 'GET',
                cache: false,
                responseType: 'json'
            }}).call().$promise.then(function(buyerxp) {
                return {xp:buyerxp};
            });
        };

        function guid() {
            function s4() {
              return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
            }
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
          }

        $delegate.Buyers.List = function(){
            return $delegate.Buyers.Get()
                .then(function(buyerxp){
                    return {
                        Items: [buyerxp], 
                        Meta: {
                            Page: 1, 
                            PageSize: 1, 
                            TotalPages: 1, 
                            TotalCount: 1, 
                            ItemRange: [1, 1]
                        }
                    };
                });
        };

        $delegate.Buyers.Update = function(){
            var update = [].slice.call(arguments)[1]; //update obj is second argument
            var token = $delegate.GetToken();
            if(update && update.xp) {
                return $resource(bachmansIntegrationsUrl + '/api/webdata/buyerxp', null, {call: {
                    method: 'PUT',
                    headers: {
                        Authorization: 'Bearer ' + token
                    }
                }}).call(update.xp).$promise.then(function(){
                    return $delegate.Buyers.Get();
                });
            } else {
                return $q.reject('Missing body');
            }
        };

        $delegate.Buyers.Patch = function(){ 
            return $q.reject('Use Buyers.Update instead');
        };

        return $delegate;
    });
}