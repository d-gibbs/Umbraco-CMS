/** Executed when the application starts, binds to events and set global state */
app.run(['$rootScope', '$route', '$location', '$cookies', 'urlHelper', 'appState', 'assetsService', 'eventsService', 'tourService', 'localStorageService', 'navigationService', 'localizationService',
    function ($rootScope, $route, $location, $cookies, urlHelper, appState, assetsService, eventsService, tourService, localStorageService, navigationService, localizationService) {

        //This sets the default jquery ajax headers to include our csrf token, we
        // need to user the beforeSend method because our token changes per user/login so
        // it cannot be static
        $.ajaxSetup({
            beforeSend: function (xhr) {
                xhr.setRequestHeader("X-UMB-XSRF-TOKEN", $cookies["UMB-XSRF-TOKEN"]);
                // This is a standard header that should be sent for all ajax requests and is required for
                // how the server handles auth rejections, etc... see https://github.com/dotnet/aspnetcore/blob/a2568cbe1e8dd92d8a7976469100e564362f778e/src/Security/Authentication/Cookies/src/CookieAuthenticationEvents.cs#L106-L107
                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
                var queryStrings = urlHelper.getQueryStringParams();
                if (queryStrings.umbDebug === "true" || queryStrings.umbdebug === "true") {
                    xhr.setRequestHeader("X-UMB-DEBUG", "true");
                }
            }
        });

        /** Listens for authentication and checks if our required assets are loaded, if/once they are we'll broadcast a ready event */
        eventsService.on("app.authenticated", function (evt, data) {

            assetsService._loadInitAssets().then(function () {

                appReady(data);

                tourService.registerAllTours().then(function () {

                    // Start intro tour
                    tourService.getTourByAlias("umbIntroIntroduction").then(function (introTour) {
                        // start intro tour if it hasn't been completed or disabled
                        if (introTour && introTour.disabled !== true && introTour.completed !== true) {
                            tourService.startTour(introTour);
                            localStorageService.set("introTourShown", true);
                        } else {
                            const introTourShown = localStorageService.get("introTourShown");
                            if (!introTourShown) {
                                // Go & show email marketing tour (ONLY when intro tour is completed or been dismissed)
                                tourService.getTourByAlias("umbEmailMarketing").then(function (emailMarketingTour) {
                                    // Only show the email marketing tour one time - dismissing it or saying no will make sure it never appears again
                                    // Unless invoked from tourService JS Client code explicitly.
                                    // Accepted mails = Completed and Declicned mails = Disabled
                                    if (emailMarketingTour && emailMarketingTour.disabled !== true && emailMarketingTour.completed !== true) {
                                        // Only show the email tour once per logged in session
                                        // The localstorage key is removed on logout or user session timeout
                                        const emailMarketingTourShown = localStorageService.get("emailMarketingTourShown");
                                        if (!emailMarketingTourShown) {
                                            tourService.startTour(emailMarketingTour);
                                            localStorageService.set("emailMarketingTourShown", true);
                                        }
                                    }
                                });
                            }
                        }
                    });
                });
            });

        });

        function appReady(data) {
            appState.setGlobalState("isReady", true);
            //send the ready event with the included returnToPath,returnToSearch data
            eventsService.emit("app.ready", data);
            returnToPath = null, returnToSearch = null;
        }

        var currentRouteParams = null;

        $rootScope.$on('$changeTitle', function (event, titlePrefix) {
            if (titlePrefix) {
                $rootScope.locationTitle = titlePrefix + " - " + $rootScope.locationTitle;
            }
        });

        /** execute code on each successful route */
        $rootScope.$on('$routeChangeSuccess', function (event, current, previous) {
            var toRetain = currentRouteParams ? navigationService.retainQueryStrings(currentRouteParams.params, current.params) : null;
            currentRouteParams = Utilities.copy(current);

            //if toRetain is not null it means that there are missing query strings and we need to update the current params
            if (toRetain) {
                $route.updateParams(toRetain);
                currentRouteParams ? currentRouteParams.params = toRetain : currentRouteParams = { params: toRetain };
            }

            var deployConfig = Umbraco.Sys.ServerVariables.deploy;
            var deployEnv, deployEnvTitle;
            if (deployConfig) {
                deployEnv = Umbraco.Sys.ServerVariables.deploy.CurrentWorkspace;
                deployEnvTitle = "(" + deployEnv + ") ";
            }

            if (current.params.section) {
                localizationService.localize("sections_" + current.params.section)
                    .then(function (currentSection) {
                        var baseTitle = currentSection + " - " + $location.$$host;
                        //Check deploy for Global Umbraco.Sys obj workspace
                        if (deployEnv) {
                            $rootScope.locationTitle = deployEnvTitle + baseTitle;
                        } else {
                            $rootScope.locationTitle = baseTitle;
                        }
                    });
            } else {
                if (deployEnv) {
                    $rootScope.locationTitle = deployEnvTitle + "Umbraco - " + $location.$$host;
                }
                $rootScope.locationTitle = "Umbraco - " + $location.$$host;
            }
        });

        /** When the route change is rejected - based on checkAuth - we'll prevent the rejected route from executing including
            wiring up it's controller, etc... and then redirect to the rejected URL.   */
        $rootScope.$on('$routeChangeError', function (event, current, previous, rejection) {
            if (rejection.path) {
                event.preventDefault();
                var returnPath = null;
                if (rejection.path == "/login" || rejection.path.startsWith("/login/")) {
                    //Set the current path before redirecting so we know where to redirect back to
                    returnPath = encodeURIComponent(window.location.href.replace(window.location.origin,''));
                }
                $location.path(rejection.path)
                if (returnPath) {
                    $location.search("returnPath", returnPath);
                }
            }
        });

        //Bind to $routeUpdate which will execute anytime a location changes but the route is not triggered.
        //This is the case when a route uses "reloadOnSearch: false" or "reloadOnUrl: false" which is the case for many or our routes so that we are able to maintain
        //global state query strings without force re-loading views.
        //We can then detect if it's a location change that should force a route or not programatically.
        $rootScope.$on('$routeUpdate', function (event, next) {
            if (!currentRouteParams || !currentRouteParams.params) {
                //if there is no current route then always route which is done with reload
                $route.reload();
            } else {
                var toRetain = navigationService.retainQueryStrings(currentRouteParams.params, next.params);
                //if toRetain is not null it means that there are missing query strings and we need to update the current params.
                if (toRetain) {
                    $route.updateParams(toRetain);
                }
                //check if the location being changed is only due to global/state query strings which means the location change
                //isn't actually going to cause a route change.
                if (navigationService.isRouteChangingNavigation(currentRouteParams.pathParams, next.pathParams)) {
                    //The location change will cause a route change, continue the route if the query strings haven't been updated.
                    $route.reload();
                } else {
                    //navigation is not changing but we should update the currentRouteParams to include all current parameters
                    if (toRetain) {
                        currentRouteParams.params = toRetain;
                    } else {
                        currentRouteParams.params = Utilities.copy(next.params);
                    }
                    //always clear the 'sr' query string (soft redirect) if it exists
                    if (currentRouteParams.params.sr) {
                        currentRouteParams.params.sr = null;
                        $route.updateParams(currentRouteParams.params);
                    }
                }
            }
        });

        //check for touch device, add to global appState
        //var touchDevice = ("ontouchstart" in window || window.touch || window.navigator.msMaxTouchPoints === 5 || window.DocumentTouch && document instanceof DocumentTouch);
        var touchDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|touch/i.test(navigator.userAgent.toLowerCase());

        appState.setGlobalState("touchDevice", touchDevice);

    }]);
