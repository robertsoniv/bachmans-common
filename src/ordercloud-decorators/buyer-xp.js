angular.module('bachmans-common')
    .config(OrderCloudSDKBuyerXP);


function OrderCloudSDKBuyerXP($provide){
    $provide.decorator('OrderCloudSDK', function($delegate, ocBuyerXp, $q){
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
    });
}