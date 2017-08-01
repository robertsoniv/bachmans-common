angular.module('orderCloud')
    .config(OrderCloudSDKAnonAdditions)
;

function OrderCloudSDKAnonAdditions($provide){
    $provide.decorator('OrderCloudSDK', function($delegate, $cookies, ocAppName){
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
    });
}