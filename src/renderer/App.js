require('../static/AgoraSig');

// // import $ from 'jquery';
// import 'bootstrap-material-design/dist/css/bootstrap-material-design.min.css';
// import 'bootstrap-material-design';

import React, { Component } from 'react';
import AgoraRtcEngine from 'agora-electron-sdk';
import { List } from 'immutable';
import path from 'path';
import os from 'os'

import {videoProfileList, audioProfileList, audioScenarioList, APP_ID, SHARE_ID } from '../utils/settings'
import base64Encode from '../utils/base64'
import WindowPicker from './components/WindowPicker/index.js'
import SignalingClient from '../main/signalingClient';

import shortid from 'shortid';

const [QUIZ_ROLE_HOST, QUIZ_ROLE_PLAYER, QUIZ_ROLE_AUDIENCE, PLAYER_ID] = ['host', 'player', 'audience', shortid.generate()];

const [GAME_STATUS_WAIT_FOR_PLAYERS, GAME_STATUS_STARTED, GAME_STATUS_ENDED] = _.times(3);

let GAME_ID;

console.log('PLAYER_ID', PLAYER_ID, 'GAME_STATUS_WAIT_FOR_PLAYERS', GAME_STATUS_WAIT_FOR_PLAYERS, 'GAME_STATUS_STARTED', GAME_STATUS_STARTED, 'GAME_STATUS_ENDED', GAME_STATUS_ENDED);

export default class App extends Component {
	constructor(props) {
        super(props);
        
        this.rtcEngine = new AgoraRtcEngine();
        
		if (!APP_ID) {
			return alert('APP_ID cannot be empty!');
        }
        else {
			this.rtcEngine.initialize(APP_ID)
			this.state = {
                local: '',
                localVideoSource: '',
                users: new List(),
                GAME_ID,
                role: 1,
                videoDevices: this.rtcEngine.getVideoDevices(),
                audioDevices: this.rtcEngine.getAudioRecordingDevices(),
                audioPlaybackDevices: this.rtcEngine.getAudioPlaybackDevices(),
                camera: 0,
                mic: 0,
                speaker: 0,
                videoProfile: 43,
                showWindowPicker: false,
                recordingTestOn: false,
                playbackTestOn: false,
                windowList: [],
                videos_on : [],
                game_status : {}
			};
		}
        this.enableAudioMixing = false;

        (async () => {
            console.log('********************************************************************************* THIS IS THE APP!!!!!!!!!')
    
            console.log('Signaling version', new Signal().getSDKVersion());
    
            let signal = this.signal = new SignalingClient(APP_ID);
    
            let signal_session = this.signal_session = await signal.login(PLAYER_ID);
          
            console.log("signal", signal);
            console.log("signal_session", signal_session);
        })();
    }

	componentDidMount() {
		this.subscribeEvents()
		window.rtcEngine = this.rtcEngine;
	}	 

	subscribeEvents = () => {
        const {signal} = this;

        console.log('signal', signal);

        signal.sessionEmitter.on('onMessageInstantReceive', (account, uid, msg) => {
            console.log('---===>>> signal.sessionEmitter.on(\'onMessageInstantReceive\':: account, uid, msg', account, uid, msg);
            
            // this.onReceiveMessage(account, msg, 'instant');
        });
        signal.channelEmitter.on('onMessageChannelReceive', (account, uid, msg) => {
            console.log('---===>>> signal.channelEmitter.on(\'onMessageChannelReceive\':: account, uid, msg', account, uid, msg);
            
            // if (account !== signal.account) {
            //     this.onReceiveMessage(signal.channel.name, msg, 'channel');
            // }
        });
    
        signal.channelEmitter.on('onChannelUserLeaved', (account, uid) => {
            console.log('---===>>> signal.channelEmitter.on(\'onChannelUserLeaved\':: account, uid', account, uid);

            const {state} = this;
            const {game_status} = state;

            if (state.quizRole === QUIZ_ROLE_HOST) {
                _.times(3).map(n => {
                    const player_key = `player${n}_player_id`;
                    if (game_status[player_key] === account) {
                        delete game_status[player_key];
                        delete game_status[`player${n}_video_stream_id`];
                    }
                });

                this.setGameStatus();
            }
            
            // client.invoke(
            //     'io.agora.signal.channel_query_num',
            //     { name: signal.channel.name },
            //     (err, val) => {
            //     $('.detail .nav').html(`${signal.channel.name}(${val.num})`);
            //     }
            // );
        });
    
        signal.channelEmitter.on('onChannelUserJoined', async (account, uid) => {
            console.log('---===>>> signal.channelEmitter.on(\'onChannelUserJoined\':: account, uid', account, uid);

            const {state} = this;
            const {game_status} = state;

            console.log('game_status.status', game_status.status);

            if (game_status.host === PLAYER_ID) {
                if (game_status.status === GAME_STATUS_WAIT_FOR_PLAYERS) {
                    let next_player;

                    _.times(3).map(i => {
                        if (!next_player && !state['player'+(i + 1)+'_player_id']) {
                            next_player = game_status['player'+(i + 1)+'_player_id'] = state['player'+(i + 1)+'_player_id'] = account;
                        }
                    });

                    console.log('next_player', next_player);

                    await this.setGameStatus();
                }
            }
            
            // client.invoke(
            //     'io.agora.signal.channel_query_num',
            //     { name: signal.channel.name },
            //     (err, val) => {
            //     $('.detail .nav').html(`${signal.channel.name}(${val.num})`);
            //     }
            // );
        });

        signal.channelEmitter.on('onChannelAttrUpdated', (key, val, ...args) => {
            console.log('---===>>> signal.channelEmitter.on(\'onChannelAttrUpdated\':: key, val, ...args', key, val, ...args);
            
            const {state} = this;

            if (key === 'game_status') {
                const game_status = val = JSON.parse(val);

                const videos_on = [];

                ['host', 'player1', 'player2', 'player3'].map(async game_role => {
                    if (game_status[game_role + '_player_id'] == PLAYER_ID) {
                        state.game_role = game_role;

                        if (!game_status[game_role + '_video_stream_id'] && state.video_stream_id) {
                            await this.setChannelAttribute('video_stream_id', [game_role, state.video_stream_id].join(','))
                        }
                        else if (game_status[game_role + '_video_stream_id']) {
                            videos_on.push(game_role);
                        }
                    }
                });

                state.game_status = game_status;

                console.log('videos_on', videos_on);

                state.videos_on = videos_on;

                if (!state.video_stream_id && state.game_role) {
                    this.handleJoin();
                }

                this.setupVideoPanels();
            }
            else if (key === 'video_stream_id' && state.quizRole === QUIZ_ROLE_HOST) {
                const {game_status} = state;
                const [game_role, video_stream_id] = val.split(',');

                game_status[`${game_role}_video_stream_id`] = video_stream_id;

                this.setGameStatus();
            }

            // client.invoke(
            //     'io.agora.signal.channel_query_num',
            //     { name: signal.channel.name },
            //     (err, val) => {
            //     $('.detail .nav').html(`${signal.channel.name}(${val.num})`);
            //     }
            // );
        });

		this.rtcEngine.on('joinedchannel', (channel, uid, elapsed) => {
            const {state} = this;
            const {game_status} = state;

            console.log('---===>>> this.rtcEngine.on(\'joinedchannel\'):: channel, uid, elapsed', channel, uid, elapsed);

            state.video_stream_id = uid;

            if (state.quizRole === QUIZ_ROLE_HOST) {
                state.game_status.host_video_stream_id = uid;
                state.game_status.host_player_id = PLAYER_ID;

                this.setupVideoPanels();
            }
            else {
                
            }
        });
        
		this.rtcEngine.on('userjoined', (uid, elapsed) => {
			console.log('---===>>> this.rtcEngine.on(\'userjoined\'):: uid, elapsed', uid, elapsed);
			if (uid === SHARE_ID && this.state.localVideoSource) {
				return
			}
            
            this.rtcEngine.setRemoteVideoStreamType(uid, 1);
            
			this.setState({
				users: this.state.users.push(uid)
			});
        });
        
		this.rtcEngine.on('removestream', (uid, reason) => {
			console.log('---===>>> this.rtcEngine.on(\'removestream\'):: uid, reason', uid, reason);
			this.setState({
				users: this.state.users.delete(this.state.users.indexOf(uid))
			});
        });
        
		this.rtcEngine.on('leavechannel', () => {
            console.log('---===>>> this.rtcEngine.on(\'leavechannel\')::');
            
            const new_state = {
                local: '', localVideoSource: '',
                users: this.state.users.splice(0),
                videos_on: []
            };

            console.log('---===>>> new_state', new_state);

			this.setState(new_state);
        });
        
		this.rtcEngine.on('audiodevicestatechanged', () => {
            console.log('---===>>> this.rtcEngine.on(\'audiodevicestatechanged\')::');
            
			this.setState({
                audioDevices: this.rtcEngine.getAudioRecordingDevices(),
                audioPlaybackDevices: this.rtcEngine.getAudioPlaybackDevices()
			});
        });
        
		this.rtcEngine.on('videodevicestatechanged', () => {
            console.log("this.rtcEngine.on('videodevicestatechanged')::");
            
			this.setState({
			    videoDevices: this.rtcEngine.getVideoDevices()
			});
        });
        
		this.rtcEngine.on('audiovolumeindication', (
			uid,
			volume,
			speakerNumber,
			totalVolume
			) => {
			// console.log("this.rtcEngine.on('audiovolumeindication')::");
			// console.log(`uid${uid} volume${volume} speakerNumber${speakerNumber} totalVolume${totalVolume}`)
        });
        
		this.rtcEngine.on('error', err => {
			console.log('---===>>> this.rtcEngine.on(\'error\')::');
			console.error(err)
        });
        
		this.rtcEngine.on('executefailed', funcName => {
			console.log('this.rtcEngine.on(\'executefailed\')::');
			console.error(funcName, 'failed to execute')
		});
    }
    
    setupVideoPanels = () => {
        let {rtcEngine, signal, state} = this; 
        const {game_status} = state;

        ['host', 'player1', 'player2', 'player3'].map(game_role => {
            if (!state[`${game_role}_video_stream_id`]) {
                let dom = document.querySelector(`#video-${game_role}`);
        
                console.log('!!!!!!!!!!!!!! dom', dom);
                console.log('game_status[`${game_role}_video_stream_id`]', game_status[`${game_role}_video_stream_id`]);
                
                if (dom && game_status[`${game_role}_video_stream_id`]) {
                    if (game_status[`${game_role}_video_stream_id`] === state.video_stream_id) {
                        rtcEngine.setupLocalVideo(dom);
                    }
                    else {
                        rtcEngine.subscribe(game_status[`${game_role}_video_stream_id`], dom);
                    }

                    state[`${game_role}_video_stream_id`] = 1;
                }
            }    
        })    

        const new_state = {
            local: state.video_stream_id
        };

        console.log('new_state', new_state);

        this.setState(new_state);
    }

	handleJoin = () => {
        let {rtcEngine, signal, state} = this; 
        
		rtcEngine.setChannelProfile(1)
		rtcEngine.setClientRole(state.role)
		rtcEngine.setAudioProfile(0, 1)
		rtcEngine.enableVideo()
		rtcEngine.setLogFile('~/agoraabc.log')
		rtcEngine.enableLocalVideo(true)
		rtcEngine.enableWebSdkInteroperability(true)
		rtcEngine.setVideoProfile(state.videoProfile, false)
		rtcEngine.enableDualStreamMode(true)
		rtcEngine.enableAudioVolumeIndication(1000, 3)
		// rtcEngine.enableDualStream(function() {
		//	 console.log("Enable dual stream success!")
		//	 }, function(err) {
		//	 console,log(err)
        //	 })
        
        console.log("Joining chanel", GAME_ID);

        rtcEngine.joinChannel(null, GAME_ID, '',	Number(`${new Date().getTime()}`.slice(7)));

	}

	handleLeave = () => {
		let {rtcEngine, signal} = this;
		
		rtcEngine.enableLocalVideo(false)
		rtcEngine.disableVideo()
		rtcEngine.enableDualStreamMode(false)

        rtcEngine.leaveChannel(this.state.channel);
        
        signal.joined = false;
        signal.leave();
	}

	handleCameraChange = e => {
		this.setState({camera: e.currentTarget.value});
		this.rtcEngine.setVideoDevice(this.state.videoDevices[e.currentTarget.value].deviceid);
	}

	handleMicChange = e => {
		this.setState({mic: e.currentTarget.value});
		this.rtcEngine.setAudioRecordingDevice(this.state.audioDevices[e.currentTarget.value].deviceid);
	}

	handleSpeakerChange = e => {
		this.setState({speaker: e.currentTarget.value});
		this.rtcEngine.setAudioPlaybackDevice(this.state.audioPlaybackDevices[e.currentTarget.value].deviceid);
	}

	handleVideoProfile = e => {
		this.setState({
			videoProfile: Number(e.currentTarget.value)
		})
	}

	/**
	 * prepare screen share: initialize and join
	 * @param {string} token 
	 * @param {string} info 
	 * @param {number} timeout 
	 */
	prepareScreenShare(token = null, info = '', timeout = 30000) {
		return new Promise((resolve, reject) => {
			let timer = setTimeout(() => {
			    reject(new Error('Timeout'))
            }, timeout)
            
			this.rtcEngine.once('videosourcejoinedsuccess', uid => {
                clearTimeout(timer)
                rtcEngine.videoSourceSetLogFile('~/videosourceabc.log')
                this.sharingPrepared = true
                resolve(uid)
			});
    
            try {
                this.rtcEngine.videoSourceInitialize(APP_ID);
                this.rtcEngine.videoSourceSetChannelProfile(1);
                this.rtcEngine.videoSourceEnableWebSdkInteroperability(true)
                // this.rtcEngine.videoSourceSetVideoProfile(50, false);
                // to adjust render dimension to optimize performance
                this.rtcEngine.setVideoRenderDimension(3, SHARE_ID, 1200, 680);
                this.rtcEngine.videoSourceJoin(token, this.state.channel, info, SHARE_ID);
            } catch(err) {
                clearTimeout(timer)
                reject(err)
			}
		})
	}

	/**
	 * start screen share
	 * @param {*} windowId windows id to capture
	 * @param {*} captureFreq fps of video source screencapture, 1 - 15
	 * @param {*} rect null/if specified, {x: 0, y: 0, width: 0, height: 0}
	 * @param {*} bitrate bitrate of video source screencapture
	 */
	startScreenShare(windowId=0, captureFreq=15, 
		rect={
			top: 0, left: 0, right: 0, bottom: 0
		}, bitrate=0
	) {
		if(!this.sharingPrepared) {
			console.error('Sharing not prepared yet.')
			return false
		};
		return new Promise((resolve, reject) => {
			this.rtcEngine.startScreenCapture2(windowId, captureFreq, rect, bitrate);
			this.rtcEngine.videoSourceSetVideoProfile(43, false);
			this.rtcEngine.startScreenCapturePreview();
		});
	}

	handleScreenSharing = e => {
		// getWindowInfo and open Modal
		let list = this.rtcEngine.getScreenWindowsInfo();

		let windowList = list.map(item => {
			return {
			ownerName: item.ownerName,
			name: item.name,
			windowId: item.windowId,
			image: base64Encode(item.image)
			}
		});

		console.log(windowList);

		this.setState({
			showWindowPicker: true,
			windowList: windowList
		});
	}

	handleWindowPicker = windowId => {
		this.setState({
			showWindowPicker: false
		});

		this.prepareScreenShare()
			.then(uid => {
			this.startScreenShare(windowId)
			this.setState({
				localVideoSource: uid
			})
			})
			.catch(err => {
			console.log(err)
		});
	}

	togglePlaybackTest = e => {
		if (!this.state.playbackTestOn) {
			let filepath = '/Users/menthays/Projects/Agora-RTC-SDK-for-Electron/example/temp/music.mp3';
			let result = this.rtcEngine.startAudioPlaybackDeviceTest(filepath);
			console.log(result);
		} else {
			this.rtcEngine.stopAudioPlaybackDeviceTest();
		}
		this.setState({
			playbackTestOn: !this.state.playbackTestOn
		})
	}

	toggleRecordingTest = e => {
		if (!this.state.recordingTestOn) {
			let result = this.rtcEngine.startAudioRecordingDeviceTest(1000);
			console.log(result);
		} else {
			this.rtcEngine.stopAudioRecordingDeviceTest();
		}
		this.setState({
			recordingTestOn: !this.state.recordingTestOn
		})
    }
    
    startQuiz = async (quizRole) => {
        const {state, signal} = this;

        if (state.quizIsOn && quizRole != state.quizRole) {
            return;
        }

        if (state.quizIsOn) {
            this.handleLeave();

            return this.setState({quizIsOn: false});
        }

        console.log('Joining as', quizRole, 'state.quizRole', state.quizRole);

        if (quizRole == QUIZ_ROLE_HOST) {
            await this.startNewGame();

            this.handleJoin();
        }
        else if (quizRole == QUIZ_ROLE_PLAYER) {
            await this.joinGame();

            this.handleJoin();
        }
        else {
            console.log('ERROR: Unknown quizRole', quizRole);
        }
    }

    setGameStatus = async () => {
        const {state, signal} = this;

        const {game_status} = state;

        let result = await this.setChannelAttribute('game_status', JSON.stringify(game_status));

        console.log('setGameStatus:: 2222 result', result);
    };

    setChannelAttribute = (key, val) => {
        return this.signal.invoke('io.agora.signal.channel_set_attr', {channel: GAME_ID, name: key, value: val});
    }

    startNewGame = async () => {        
        const {state, signal} = this;

        const {game_status} = state;

        GAME_ID = shortid.generate();

        console.log('GAME_ID', GAME_ID); 

        const channel =  await signal.join(GAME_ID); 

        console.log('=-=-=-=-=-=-=-=-=-=-=-=- channel', channel);
        
        let result = await signal.invoke('io.agora.signal.channel_query_userlist', {name: GAME_ID});

        console.log('1111 result', result)

        if (result.list && result.list.length === 1 && result.list[0][0] === PLAYER_ID) {
            state.channel = channel;

            game_status.status = GAME_STATUS_WAIT_FOR_PLAYERS;
            game_status.host = PLAYER_ID;
            game_status.player1_player_id = state.player1_player_id;
            game_status.player2_player_id = state.player2_player_id;
            game_status.player3_player_id = state.player3_player_id;

            console.log('Created a new game successfully.');

            await this.setGameStatus();

            // await signal.invoke('io.agora.signal.user_set_attr', {name: "GAME_ID" + account, value: GAME_ID});
            // await signal.invoke('io.agora.signal.user_set_attr', {name: "PLAYER_ID" + account, value: PLAYER_ID});
            // await signal.invoke('io.agora.signal.user_set_attr', {name: "HOST_PLAYER_ID" + account, value: PLAYER_ID});



            this.setState({quizIsOn: true, quizRole: QUIZ_ROLE_HOST, GAME_ID, channel});
        }
        else {
            console.log('ERROR: Channel', GAME_ID, 'is not empty or owned by someone else.');
        }
    }

    joinGame = async () => {
        const{state, signal} = this;

        GAME_ID = state.GAME_ID;

        if (!GAME_ID) {
            console.log("ERROR:: Required GAME_ID missing");

            return;
        }

        this.setState({quizIsOn: true, quizRole: QUIZ_ROLE_PLAYER, GAME_ID});

        setTimeout(async () => {
            const channel =  await signal.join(GAME_ID); 

            this.setState({channel});

            console.log('=-=-=-=-=-=-=-=-=-=-=-=- channel', channel);

            // channel.
            
            let result = await signal.invoke('io.agora.signal.channel_query_userlist', {name: GAME_ID});

            console.log('1111 result', result);
        }, 1000);
    }

    showQuestion = () => {
        document.querySelector("")
    }

	// handleAudioMixing = e => {
	//	 const path = require('path')
	//	 let filepath = path.join(__dirname, './music.mp3');
	//	 if (this.enableAudioMixing) {
	//	 this.rtcEngine.stopAudioMixing()
	//	 } else {
	//	 this.rtcEngine.startAudioMixing(filepath, false, false, -1);
	//	 }
	//	 this.enableAudioMixing = !this.enableAudioMixing;
	// }

    buildMsg(msg, me, ts, sender) {
        console.log('buildMsg(msg, me, ts)::');
      let html = '';
      let timeStr = this.compareByLastMoment(ts);
      if (timeStr) {
        html += `<div>${timeStr}</div>`;
      }
      let className = me ? 'message right clearfix' : 'message clearfix';
      html += '<li class="' + className + '">';
      html += '<img src="https://s3-us-west-2.amazonaws.com/s.cdpn.io/245657/1_copy.jpg">';
      html += sender || "";
      html +=
        '<div class="bubble">' +
        Utils.safe_tags_replace(msg) +
        '<div class="corner"></div>';
      html += '<span>' + this.parseTwitterDate(ts) + '</span></div></li>';
  
      return html;
    }
  
    compareByLastMoment(ts) {
        console.log('compareByLastMoment(ts)::');
      let lastMoment = null;
      this.chats.forEach(item => {
        if (
          item.id === this.current_conversation.id &&
          item.type === this.current_conversation.type
        ) {
          lastMoment = item.lastMoment;
        }
      });
      if (!lastMoment) {
        let time = new Date();
        return time.toDateString() + ' ' + time.toLocaleTimeString();
      }
      let diff = Math.floor((ts - lastMoment) / 1000);
      if (diff < 120) {
        return '';
      }
      return new Date().toLocaleTimeString();
    }

    parseTwitterDate(tdate) {
        console.log('parseTwitterDate(tdate)::');
      var system_date = new Date(Date.parse(tdate));
      var user_date = new Date();
      // If (K.ie) {
      //     system_date = Date.parse(tdate.replace(/( \+)/, ' UTC$1'))
      // }
      var diff = Math.floor((user_date - system_date) / 1000);
      if (diff <= 1) {
        return 'just now';
      }
      if (diff < 20) {
        return diff + ' seconds ago';
      }
      if (diff < 40) {
        return 'half a minute ago';
      }
      if (diff < 60) {
        return 'less than a minute ago';
      }
      if (diff <= 90) {
        return 'one minute ago';
      }
      if (diff <= 3540) {
        return Math.round(diff / 60) + ' minutes ago';
      }
      if (diff <= 5400) {
        return '1 hour ago';
      }
      if (diff <= 86400) {
        return Math.round(diff / 3600) + ' hours ago';
      }
      if (diff <= 129600) {
        return '1 day ago';
      }
      if (diff < 604800) {
        return Math.round(diff / 86400) + ' days ago';
      }
      if (diff <= 777600) {
        return '1 week ago';
      }
      return 'on ' + system_date;
    }

    render() {
        const {state} = this;

		let windowPicker

		if (state.showWindowPicker) {
			windowPicker = <WindowPicker
			onSubmit={this.handleWindowPicker}
			onCancel={e => this.setState({showWindowPicker: false})}
			windowList={state.windowList}
			/>
        }
        
        // console.log('state', state);
        // console.log('state.users', state.users);
        
        // console.log('require(\'../player.jpg\')', require('../player.jpg'))

		return (
			<div className="columns" style={{padding: "20px", height: '100%', margin: '0'}}>

            { state.showWindowPicker ? windowPicker : '' }

			<div className="column is-one-quarter" style={{overflowY: 'auto'}}>
				<div className="field">
				<label className="label">Player ID</label>
				<div className="control">
                    {
                        PLAYER_ID
                    }
				</div>
				</div>
				<div className="field">
				<label className="label">Game ID</label>
				<div className="control">
                    {
                        !state.quizIsOn ? (
                            <input onChange={e => this.setState({GAME_ID: e.currentTarget.value})} value={state.GAME_ID} className="input" type="text" placeholder="Input a channel name" />
                        ) : GAME_ID
                    }
				</div>
				</div>
				<div className="field">
				<label className="label">Role</label>
				<div className="control">
					<div className="select"	style={{width: '100%'}}>
					<select onChange={e => this.setState({role: Number(e.currentTarget.value)})} value={state.role} style={{width: '100%'}}>
						<option value={1}>Anchor</option>
						<option value={2}>Audience</option>
					</select>
					</div>
				</div>
				</div>
				<div className="field">
				<label className="label">VideoProfile</label>
				<div className="control">
					<div className="select"	style={{width: '100%'}}>
					<select onChange={this.handleVideoProfile} value={state.videoProfile} style={{width: '100%'}}>
						{videoProfileList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
					</select>
					</div>
				</div>
				</div>
				<div className="field">
				<label className="label">AudioProfile</label>
				<div className="control">
					<div className="select"	style={{width: '50%'}}>
					<select onChange={this.handleAudioProfile} value={state.audioProfile} style={{width: '100%'}}>
						{audioProfileList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
					</select>
					</div>
					<div className="select"	style={{width: '50%'}}>
					<select onChange={this.handleAudioScenario} value={state.audioScenario} style={{width: '100%'}}>
						{audioScenarioList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
					</select>
					</div>
				</div>
				</div>
				<div className="field">
				<label className="label">Camera</label>
				<div className="control">
					<div className="select"	style={{width: '100%'}}>
					<select onChange={this.handleCameraChange} value={state.camera} style={{width: '100%'}}>
						{state.videoDevices.map((item, index) => (<option key={index} value={index}>{item.devicename}</option>))}
					</select>
					</div>
				</div>
				</div>
				<div className="field">
				<label className="label">Microphone</label>
				<div className="control">
					<div className="select"	style={{width: '100%'}}>
					<select onChange={this.handleMicChange} value={state.mic} style={{width: '100%'}}>
						{state.audioDevices.map((item, index) => (<option key={index} value={index}>{item.devicename}</option>))}
					</select>
					</div>
				</div>
				</div>
				<div className="field">
				<label className="label">Loudspeaker</label>
				<div className="control">
					<div className="select"	style={{width: '100%'}}>
					<select onChange={this.handleSpeakerChange} value={state.speaker} style={{width: '100%'}}>
						{state.audioPlaybackDevices.map((item, index) => (<option key={index} value={index}>{item.devicename}</option>))}
					</select>
					</div>
				</div>
				</div>
				{/* <div className="field is-grouped is-grouped-right">
				<div className="control">
					<button onClick={this.handleAudioMixing} className="button is-link">Start/Stop Audio Mixing</button>
				</div>
				</div> */}
				<div className="field is-grouped is-grouped-right">
				<div className="control">
					<button onClick={this.handleJoin} className="button is-link">Join</button>
					<button onClick={this.handleLeave} className="button is-link">Leave</button>
				</div>
				</div>
				<hr/>
				<div className="field">
				<label className="label">Screen Share</label>
				<div className="control">
					<button onClick={this.handleScreenSharing} className="button is-link">Screen Share</button>
				</div>
				</div>

				<div className="field">
				<label className="label">Audio Playback Test</label>
				<div className="control">
					<button onClick={this.togglePlaybackTest} className="button is-link">{state.playbackTestOn ? 'stop' : 'start'}</button>
				</div>
				</div>
				<div className="field">
                    <label className="label">Audio Recording Test</label>
                    <div className="control">
                        <button onClick={this.toggleRecordingTest} className="button is-link">{state.recordingTestOn ? 'stop' : 'start'}</button>
                    </div>
				</div>
				<div className="field">
                    <label className="label">Host Quiz</label>
                    <div className="control">
                        <button onClick={e => this.startQuiz(QUIZ_ROLE_HOST)} id="host-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_HOST) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_HOST ? 'stop' : 'start'}</button>
                    </div>
				</div>
				<div className="field">
                    <label className="label">Answer Quiz</label>
                    <div className="control">
                        <button onClick={e => this.startQuiz(QUIZ_ROLE_PLAYER)} id="participant-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_PLAYER) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_PLAYER ? 'stop' : 'start'}</button>
                    </div>
				</div>
				<div className="field">
                    <label className="label">Watch Quiz</label>
                    <div className="control">
                        <button onClick={e => this.startQuiz(audience)} id="audience-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_AUDIENCE) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_AUDIENCE ? 'stop' : 'start'}</button>
                    </div>
				</div>
			</div>
            <div className="tile is-ancestor">
                <div className="tile is-vertical is-parent" style={{border: "1px dashed green", bbackground: "lightgreen"}}>
                        <div className="tile is-child" style={{position: "relative"}}>
                            <div className="card" style={{position: "absolute", left: 0, top: 0, border: "1px solid red", width: "100%", height: "100%"}}>
                                this is a question panel
                            </div>
                        </div>
                        {state.quizIsOn ? (
                            <div className="tile is-child" style={{border: "1px dashed blue", display: "contents"}}>
                                <div className="container box" style={{padding: ".2rem", border: "1px solid black"}}>
                                    <div style={{height: "250px", overflow: "hidden", padding: "3px", animationName: "example", animationDuration: "1s"}}>
                                        <div className="column is-three-quarters window-container" style={{columnGap: ".1rem"}}>
                                            {['host', 'player1', 'player2', 'player3'].map((item, key) => (
                                                <Window harold_trace="1111" key={key} game_role={item} uid={state.game_status[`${item}_video_stream_id`]} rtcEngine={this.rtcEngine} show_icon={!state.game_status[`${item}_video_stream_id`]} role={state.game_status[`${item}_video_stream_id`] === state.video_stream_id ? 'local' : 'remote'}></Window>
                                            ))}
                                            
                                            {/* {state.local ? (<Window harold_trace="2222" uid={state.local} rtcEngine={this.rtcEngine} role="local"></Window>) : ''} */}

                                            {/* {state.localVideoSource ? (<Window harold_trace="3333" uid={state.localVideoSource} rtcEngine={this.rtcEngine} role="localVideoSource"></Window>) : ''} */}

                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : ""}
                 </div>

            </div>

			</div>
		)
		}
}

class Window extends Component {
	constructor(props) {
	super(props)
		this.state = {
			loading: false
        }
        
        console.log('Window.constructor props', props);
	}

	componentDidMount() {
        // let dom = document.querySelector(`#video-${this.props.uid}`);

        // console.log('dom', dom);
        
		// if (this.props.role === 'local') {
		// 	dom && this.props.rtcEngine.setupLocalVideo(dom)
        // } 
        // else if (this.props.role === 'localVideoSource') {
        //     dom && this.props.rtcEngine.setupLocalVideoSource(dom)
            
		// 	this.props.rtcEngine.setupViewContentMode('videosource', 1);
		// 	this.props.rtcEngine.setupViewContentMode(String(SHARE_ID), 1);
        // } 
        // else if (this.props.role === 'remote') {
		// 	dom && this.props.rtcEngine.subscribe(this.props.uid, dom)
        // } 
        // else if (this.props.role === 'remoteVideoSource') {
		// 	dom && this.props.rtcEngine.subscribe(this.props.uid, dom)
		// 	this.props.rtcEngine.setupViewContentMode('videosource', 1);
		// 	this.props.rtcEngine.setupViewContentMode(String(SHARE_ID), 1);
		// }
	}

	render() {
		return (
			<div className="window-item box" style={{padding: ".2rem", border: "1px solid red"}} haa-trace={this.props.harold_trace}>
                <img className="player-icon" style={{verticalAlign: "middle", marginLeft: "auto", marginRight: "auto", display: (this.props.show_icon ? "block" : "none")}} src={require('../player.jpg')}/>
			    <div className="video-item is-fluid" id={'video-' + this.props.game_role} style={{display: (!this.props.show_icon ? "block" : "none")}}></div>
			</div>
		)
	}
}