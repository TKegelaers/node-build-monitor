var request = require('request'),
    async = require('async'),
    moment = require('moment'),
    TEAMCITY_DATE_FORMAT = 'YYYYMMDDTHHmmss+Z',
    _ = require('underscore');
module.exports = function () {
    var self = this,
        selectMany = function (array, selector) {
            return array.map(selector).reduce(function (x, y) {
                return x.concat(y);
            }, []);
        },

        getBuildsByProject = function(){
           return self.configuration.url +
                   '/httpAuth/app/rest/builds?locator=project:' +
                    self.configuration.project +
                    ',branch:default:any';
        },

        getLastBuildUrl = function(){
          return self.configuration.url +
              '/httpAuth/app/rest/buildTypes/id:' + self.configuration.buildConfigurationId +
              '/builds' +
              '?locator=lookupLimit:1' +
              ',branch:default:any';
        },

        getFinishedBuildsUrl = function () {
            return self.configuration.url +
                '/httpAuth/app/rest/buildTypes/id:' + self.configuration.buildConfigurationId +
                '/builds' +
                '?locator=branch:default:any';
        },
        getCanceledBuildsUrl = function () {
            return getFinishedBuildsUrl() + ',canceled:true';
        },
        getRunningBuildsUrl = function () {
            return getFinishedBuildsUrl() + ',running:true';
        },
        getBuildDetailsUrl = function (url) {
            return self.configuration.url + url;
        },
        makeRequest = function (url, callback) {
            request({
                    'url': url,
                    'rejectUnauthorized': false,
                    'headers': {'Accept': 'application/json'},
                    'json': true
                },
                function (error, response, body) {
                    callback(error, body);
                });
        },
        requestBuilds = function (callback) {
            //var requestFinishedBuilds = makeRequest.bind(this, getFinishedBuildsUrl());
            //var requestCanceledBuilds = makeRequest.bind(this, getCanceledBuildsUrl());
                var requestRunningBuilds = makeRequest.bind(this, getRunningBuildsUrl());
                //var requestLastBuild = makeRequest.bind(this, getLastBuildUrl());
            var requestBuildsByProject = makeRequest.bind(this,getBuildsByProject());
            console.log(getLastBuildUrl())
            async.parallel([
                //requestFinishedBuilds,
                requestRunningBuilds,
                //requestCanceledBuilds
                //requestLastBuild,
                requestBuildsByProject
            ], function (error, data) {
                var merged = selectMany(data, function (x) {
                    return x.build || [];
                });

                var uniques = _.uniq(merged,function(x){
                    return x.buildTypeId && x.branchName;
                })

                callback(error, uniques);
            });
        },
        requestBuild = function (build, callback) {
            makeRequest(getBuildDetailsUrl(build.href), function (error, data) {
                callback(null, simplifyBuild(data));
            });
        },
        queryBuilds = function (callback) {
            requestBuilds(function (error, body) {
                async.map(body, requestBuild, function (error, results) {
                    callback(results);
                });
            });
        },
        parseStartDate = function (build) {
            return moment(build.startDate, 'YYYYMMDDTHHmmss+Z').toDate();
        },
        parseFinishDate = function (build) {
            if (build.finishDate) {
                return moment(build.finishDate, TEAMCITY_DATE_FORMAT).toDate();
            }

            return null;
        },
        getStatus = function (build) {
            if (build.running) return "Blue";
            if (build.canceledInfo) return "Gray";

            if (build.status === "SUCCESS") return "Green";
            if (build.status === "FAILURE") return "Red";
            if (build.status === "ERROR") return "Red";
            if (build.status === "UNKNOWN") return "Gray";

            return null;
        },
        getStatusText = function (build) {
            if (build.running) return "Running";
            if (build.canceledInfo) return "Canceled";

            if (build.status === "SUCCESS") return "Success";
            if (build.status === "FAILURE") return "Failure";
            if (build.status === "ERROR") return "Error";
            if (build.status === "UNKNOWN") return "Unknown";

            return null;
        },
        getRequestedFor = function (build) {

           if(build.running === true) return null;

           // if (build.triggered.type === 'user' && build.triggered.user) {
             //   return build.triggered.user.name;
            //}
            //else if (build.triggered.type === 'vcs') {
              //  return build.triggered.details;
           // }

            return build.lastChanges.change[0].username;

           // return null;
        },
        simplifyBuild = function (res) {
            return {
                id: res.buildTypeId + '|' + res.number,
                project: res.buildType.projectName,
                definition: res.buildType.name,
                branchName: res.branchName,
                number: res.number,
                isRunning: res.running === true,
                startedAt: parseStartDate(res),
                finishedAt: parseFinishDate(res),
                requestedFor: getRequestedFor(res),
                statusText: getStatusText(res),
                status: getStatus(res),
                reason: res.triggered.type,
                hasErrors: false,
                hasWarnings: false
            };
        };

    self.configure = function (config) {
        self.configuration = config;
    };

    self.check = function (callback) {
        queryBuilds(callback);
    };
};