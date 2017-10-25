angular.module('bachmans-common')
.factory('bachPP', bachmansPurplePerks);

function bachmansPurplePerks($http, $filter) {
var service = {
    CheckBalance: _checkBalance
}

function _checkBalance(user) {
    var date = new Date();
    var expirationDate = new Date(date.getFullYear(), 3 * (Math.ceil((date.getMonth() + 1) / 3)), 1) - 1;     
    var purplePerks = {};
    $http.post('https://Four51TRIAL104401.jitterbit.net/BachmansOnPrem/PurplePerksBalanceCheck', {
        "card_number": "777777" + user.xp.LoyaltyID
    }).success(function(perks) {
        if (perks.card_value != "cardNumber not available" && perks.card_value > 0) {
            purplePerks = {
                Balance: Number(perks.card_value),
                PointsEarned: perks.card_value,
                CardNumber: "777777" + user.xp.LoyaltyID,
                LoyaltyID: user.xp.LoyaltyID,
                ExpirationDate: $filter('date')(expirationDate, 'MM/dd/yyyy')
            }
        } else {
            purplePerks = {
                Balance: 50,
                PointsEarned: 0,
                CardNumber: "777777" + user.xp.LoyaltyID,
                LoyaltyID: user.xp.LoyaltyID,
                ExpirationDate: $filter('date')(expirationDate, 'MM/dd/yyyy')
            }
        }
        return purplePerks;
    }).error(function(error) {
        console.log(error);
        return null;
        
    });
}

return service;
}