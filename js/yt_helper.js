﻿//A global object which abstracts more difficult implementations of retrieving data from YouTube.
YTHelper = (function(){
    "use strict";

    //Be sure to filter out videos and suggestions which are restricted by the users geographic location.
    var searchUrl = "http://gdata.youtube.com/feeds/api/videos?orderBy=relevance&time=all_time&max-results=30&format=5&v=2&alt=json&callback=?&restriction=" + geoplugin_countryCode() + "&q=";
    var suggestUrl = "http://suggestqueries.google.com/complete/search?hl=en&ds=yt&client=youtube&hjson=t&cp=1&format=5&v=2&alt=json&callback=?&restriction=" + geoplugin_countryCode() + "&q=";
        
    //This is necessary because not all songs will play embedded, but YouTube does not expose all the criterion for a song not playing.
    //http://apiblog.youtube.com/2011/12/understanding-playback-restrictions.html
    var blacklist = ['7AW9C3-qWug'];

    //Convert JSON response into object.
    var buildYouTubeVideo = function(entry){
        var youtubeVideo = {
            //Strip out the videoid. An example of $t's contents: tag:youtube.com,2008:video:UwHQp8WWMlg
            videoId: entry.id.$t.substring(entry.id.$t.length - 11),
            title: entry.title.$t,
            duration: entry.media$group.yt$duration.seconds,
            accessControls: entry.yt$accessControls,
            appControl: entry.app$control,
            //Returns whether the video was found to have any content restrictions which would restrict playback.
            isPlayable: function(){
                var isPlayable = $.inArray(this.videoId, blacklist) !== 0;

                //A video may have access controls which limit its playability. IE: embedding disabled, syndication disabled.
                $(this.accessControls).each(function(){
                    if (this.permission === "denied" && (this.action === "embed" || this.action === "syndicate")){
                        isPlayable = false;
                    }
                });

                //Restrictions may be implemented at a parent level, though, too.
                if(this.appControl){
                    var appControlState = this.appControl.yt$state;

                    if (appControlState.name === "restricted" && appControlState.reasonCode === "limitedSyndication"){
                        isPlayable = false;
                    }
                }

                return isPlayable;
            }
        };

        return youtubeVideo;
    };

    return {
        //Determine whether a given youtube video will play properly inside of the Google Chrome Extension.
        //NOTE: YouTube has explicitly stated that the only way to know 'for sure' that a video will play is to click 'Play.'
        //This statement has been proven quite true. As such, this method will only state whether a video is playable based on information exposed via the YouTube API.
        isPlayable: function (youtubeVideoId, callback) {
            var self = this;
            //http://apiblog.youtube.com/2011/12/understanding-playback-restrictions.html
            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + youtubeVideoId + '?v=2&alt=json-in-script&format=5&callback=?', function (data) {
                var video = buildYouTubeVideo(data.entry);
                callback(video.isPlayable());   
            });
        },

        //Performs a search of YouTube with the provided text and returns a list of playable videos (<= max-results)
        //TODO: There is some code-repetition going on inside here. DRY!
        search: function (text, callback) {
            var self = this;

            $.getJSON(searchUrl + text, function (response) {
                var playableVideos = [];

                //Add all playable songs to a list and return.
                $(response.feed.entry).each(function(){
                    var video = buildYouTubeVideo(this);

                    if(video.isPlayable()){
                        playableVideos.push(video);
                    }
                });

                callback(playableVideos);
            });
        },
        
        //Returns a list of suggested search-queries for YouTube searches based on the given text.
        suggest: function (text, callback) {
            $.getJSON(suggestUrl + text, function (response) {
                var suggestions = [];

                $(response[1]).each(function(){
                    suggestions.push(this[0]);
                });

                callback(suggestions);
            });
        },

        //Takes a videoId which is presumed to have content restrictions and looks through YouTube
        //for a song with a similiar name that might be the right song to play.
        findPlayable: function(videoId, callback){
            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + videoId + '?v=2&alt=json-in-script&callback=?', function (data) {
                var songName = data.entry.title.$t;

                YTHelper.search(songName, function (videos) {
                    var playableSong = null;

                    $(videos).each(function(){
                        if(this.isPlayable()){
                            playableSong = this;
                            return;
                        }
                    });

                    callback(playableSong);
                });
            });
        },

        //Takes a URL and returns a videoId if found inside of the URL.
        parseUrl: function(url){
            //First try the really simple match -- ?v=''
            var videoId = $.url(url).param('v');

            if (!videoId) {
                //Try more robust matching pattern. I'm using this along with the URL jQuery plug-in because I can't decipher this regex, but it matches a lot.
                var match = url.match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/);
                if (match && match[7].length === 11){
                    videoId = match[7];
                }
            }

            return videoId;
        },

        getVideoInformation: function(videoId, callback){
            $.getJSON('http://gdata.youtube.com/feeds/api/videos/' + videoId + '?v=2&alt=json-in-script&callback=?', function (data) {
                callback(data.entry);
            });
        }
    };
})();