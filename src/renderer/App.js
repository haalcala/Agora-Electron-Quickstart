require('../static/AgoraSig');

// // import $ from 'jquery';
// import 'bootstrap-material-design/dist/css/bootstrap-material-design.min.css';
// import 'bootstrap-material-design';

import React, { Component } from 'react';
import AgoraRtcEngine from 'agora-electron-sdk';
import { List } from 'immutable';
import path from 'path';
import os from 'os'
import _ from 'lodash'

import {Alert} from 'react-bootstrap'

import { videoProfileList, audioProfileList, audioScenarioList, APP_ID, SHARE_ID } from '../utils/settings'
import base64Encode from '../utils/base64'
import WindowPicker from './components/WindowPicker/index.js'
import QuestionPanel from './components/QuestionPanel/index.js'
import SignalingClient from '../main/signalingClient';

import shortid from 'shortid';
import { watchFile } from 'fs';

const [QUIZ_ROLE_HOST, QUIZ_ROLE_PLAYER, QUIZ_ROLE_AUDIENCE, PLAYER_ID] = ['host', 'player', 'audience', shortid.generate()];

const [GAME_STATUS_INITIALISED, GAME_STATUS_WAIT_FOR_PLAYERS, GAME_STATUS_STARTED, GAME_STATUS_ENDED] = _.times(4);

let GAME_ID = 'xEqZePpLt';

const QUIZ_STATUS_TEXT = ["Game Initialised", "Wating for players", "Quiz Started", 'Quiz Ended'];


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
				videos_on: [],
                game_status: {},
                next_question: "",
                next_question_answers: [],
			};
		}
		this.enableAudioMixing = false;

		(async () => {
			console.log('********************************************************************************* THIS IS THE APP!!!!!!!!!')

			console.log('Signaling version', new Signal().getSDKVersion());

			let signal = this.signal = new SignalingClient(APP_ID);

            // await signal.login(PLAYER_ID);
    
            // let signal_session = this.signal_session = await signal.login(PLAYER_ID);

			// console.log("signal", signal);
			// console.log("signal_session", signal_session);
		})();
	}

	componentDidMount() {
		this.subscribeEvents()
		window.rtcEngine = this.rtcEngine;
	}

	subscribeEvents = () => {
		const { signal } = this;

		console.log('signal', signal);

		signal.sessionEmitter.on('onMessageInstantReceive', async (account, uid, msg) => {
			console.log('---===>>> signal.sessionEmitter.on(\'onMessageInstantReceive\':: account, uid, msg', account, uid, msg, typeof(msg));

            // this.onReceiveMessage(account, msg, 'instant');

            if (msg.charAt(0) === "{" && msg.charAt(msg.length-1) === "}") {
                msg = JSON.parse(msg);
            }

            console.log('---- msg', msg, typeof(msg));
            
			const { state } = this;
            const { game_status, quizRole } = state;

            const [command, val] = typeof(msg) === "string" && msg.split(",") || [];

            console.log('state', state, 'command', command, 'val', val);

            if (quizRole === QUIZ_ROLE_HOST) {
                if (command === 'answer') {
                    _.times(4).map(i => {
                        if (game_status[`player${i+1}_player_id`] === account) {
                            state[`player${i+1}_answer`] = val;

                            game_status[`player${i+1}_answered`] = true;
    
                            console.log(`player${i+1}_answer`, val);

                            this.setState({});
                        }
                    });
                }
                else if (command === "assign_player") {
                    if (game_status.host_player_id === PLAYER_ID) {
                        let next_player;
        
                        _.times(3).map(i => {
                            if (!next_player && !game_status['player' + (i + 1) + '_player_id']) {
                                next_player = game_status['player' + (i + 1) + '_player_id'] = account;

                                delete game_status[`player${i+1}_answered`];
                            }
                        });
        
                        console.log('next_player', next_player);
        
                        next_player && await this.setGameStatus();        
                    }        
                }
            }
            else if (quizRole === QUIZ_ROLE_AUDIENCE || quizRole === QUIZ_ROLE_PLAYER) {
                if (msg.game_status) {
                    console.log('setting new game_status');

                    this.setState({game_status: msg.game_status});
                }
            }
		});
		signal.channelEmitter.on('onMessageChannelReceive', (account, uid, msg) => {
			console.log('---===>>> signal.channelEmitter.on(\'onMessageChannelReceive\':: account, uid, msg', account, uid, msg);

			// if (account !== signal.account) {
			//     this.onReceiveMessage(signal.channel.name, msg, 'channel');
			// }
		});

		signal.channelEmitter.on('onChannelUserLeaved', (account, uid) => {
			console.log('---===>>> signal.channelEmitter.on(\'onChannelUserLeaved\':: account, uid', account, uid);

			const { state } = this;
			const { game_status } = state;

			if (state.quizRole === QUIZ_ROLE_HOST) {
				_.times(3).map(n => {
					const player_key = `player${n}_player_id`;
					if (game_status[player_key] === account) {
                        console.log('removing player with account id', account);

						delete game_status[player_key];
						delete game_status[`player${n}_video_stream_id`];
					}
				});

				this.setGameStatus();
			}
		});

		signal.channelEmitter.on('onChannelUserJoined', async (account, uid) => {
			console.log('---===>>> signal.channelEmitter.on(\'onChannelUserJoined\':: account, uid', account, uid);

			const { state, signal } = this;
			const { game_status } = state;

			// console.log('game_status.state', game_status.state);

            state.quizIsOn && state.quizRole === QUIZ_ROLE_HOST && await signal.sendMessage(account, JSON.stringify({game_status}));
		});

		signal.channelEmitter.on('onChannelAttrUpdated', async (key, val, op, ...args) => {
            console.log('---===>>> signal.channelEmitter.on(\'onChannelAttrUpdated\':: key, val, op, ...args', key, val, op, ...args);

            if (op === "set") {
                return;
            }


			const { state } = this;

            console.log('signal.channelEmitter.on(\'onChannelAttrUpdated\':: state', state);
            
            if (key === 'game_status') {
                const game_status = val = JSON.parse(val);
    
                ['host', 'player1', 'player2', 'player3'].map(async game_role => {
                    if (game_status[game_role + '_player_id'] == PLAYER_ID) {
                        state.game_role = game_role;
                    }
                });

                state.game_status = game_status;
        
                if (!state.video_stream_id && state.game_role) {
                    this.handleJoin();
                }

                this.setupVideoPanels();

                const new_state = {};

                if (game_status.questionId != state.questionId) {
                    new_state.answer_from_host = ""; 
                    delete new_state.selected_answer;
                }

                ['question', 'question_answers'].map(prop => {
                    new_state[prop] = game_status[prop];
                });

                new_state.answer_from_host = game_status.answer;

                this.setState(new_state);
            }
            else if (key === 'video_stream_id' && state.quizRole === QUIZ_ROLE_HOST) {
                const { game_status } = state;
                const [game_role, video_stream_id] = val.split(',');

                game_status[`${game_role}_video_stream_id`] = parseInt(video_stream_id);

                delete state[`${game_role}_video_stream_id`];

                this.setGameStatus();

                this.setupVideoPanels();
            }
		});

		this.rtcEngine.on('joinedchannel', (channel, uid, elapsed) => {
			const { state } = this;
			const { game_status } = state;

			console.log('---===>>> this.rtcEngine.on(\'joinedchannel\'):: channel, uid, elapsed', channel, uid, elapsed);

			state.video_stream_id = uid;

			if (state.quizRole === QUIZ_ROLE_HOST) {
				game_status.host_video_stream_id = uid;

				this.setupVideoPanels();
            }
            else if (state.quizRole === QUIZ_ROLE_PLAYER && state.game_role) {
                if (!game_status[state.game_role + '_video_stream_id'] && state.video_stream_id) {
                    process.nextTick(() => {
                        this.setChannelAttribute('video_stream_id', [state.game_role, state.video_stream_id].join(','));
                    });
                }
            }
		});

		this.rtcEngine.on('userjoined', (uid, elapsed) => {
			console.log('---===>>> this.rtcEngine.on(\'userjoined\'):: uid, elapsed', uid, elapsed);
			if (uid === SHARE_ID && this.state.localVideoSource) {
				return
			}

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

		this.rtcEngine.on('error', (...err) => {
			console.log('---===>>> this.rtcEngine.on(\'error\')::');
			console.error(...err)
		});

		this.rtcEngine.on('executefailed', funcName => {
			console.log('this.rtcEngine.on(\'executefailed\')::');
			console.error(funcName, 'failed to execute')
		});
	}

	setupVideoPanels = () => {
        console.log('setupVideoPanels::');

		let { rtcEngine, signal, state } = this;
		const { game_status } = state;

		['host', 'player1', 'player2', 'player3'].map(game_role => {
			if (!state[`${game_role}_video_stream_id`]) {
				let dom = document.querySelector(`#video-${game_role}`);

				// console.log('!!!!!!!!!!!!!! dom', dom);
				console.log('game_status['+game_role+'_video_stream_id]', game_status[`${game_role}_video_stream_id`]);

				if (dom && game_status[`${game_role}_video_stream_id`]) {
                    const uid = parseInt(game_status[`${game_role}_video_stream_id`]);

                    console.log('enabling video stream id', uid);
                    
					// if (uid === state.video_stream_id) {
					// 	rtcEngine.setupLocalVideo(dom);
					// }
					// else {
					// 	rtcEngine.subscribe(uid, dom);
					// 	rtcEngine.setRemoteVideoStreamType(uid, 1);
					// }
                }
            }
            
            state[`${game_role}_video_stream_id`] = !!game_status[`${game_role}_video_stream_id`];
		})

		const new_state = {
			local: state.video_stream_id
		};

		console.log('new_state', new_state);

		this.setState(new_state);
	}

	handleJoin = () => {
		try {
			let { rtcEngine, signal, state } = this;

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

			rtcEngine.joinChannel(null, GAME_ID, '', Number(`${new Date().getTime()}`.slice(7)));
		}
		catch (e) {
			console.log('handleJoin:: ERRROR:', e);

			throw e;
		}
	}

	handleLeave = () => {
        console.log('handleLeave::');

		let { rtcEngine, signal } = this;

		rtcEngine.enableLocalVideo(false)
		rtcEngine.disableVideo()
		rtcEngine.enableDualStreamMode(false)

		rtcEngine.leaveChannel(GAME_ID);

		signal.leave();

        signal.logout();
        
        // this.signal = null;
	}

	handleCameraChange = e => {
		this.setState({ camera: e.currentTarget.value });
		this.rtcEngine.setVideoDevice(this.state.videoDevices[e.currentTarget.value].deviceid);
	}

	handleMicChange = e => {
		this.setState({ mic: e.currentTarget.value });
		this.rtcEngine.setAudioRecordingDevice(this.state.audioDevices[e.currentTarget.value].deviceid);
	}

	handleSpeakerChange = e => {
		this.setState({ speaker: e.currentTarget.value });
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
			} catch (err) {
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
	startScreenShare(windowId = 0, captureFreq = 15,
		rect = {
			top: 0, left: 0, right: 0, bottom: 0
		}, bitrate = 0
	) {
		if (!this.sharingPrepared) {
			console.error('Sharing not prepared yet.');
			return false;
        }
        
		return new Promise((resolve, reject) => {
			this.rtcEngine.startScreenCapture2(windowId, captureFreq, rect, bitrate);
			this.rtcEngine.videoSourceSetVideoProfile(43, false);
			this.rtcEngine.startScreenCapturePreview();
		});
	}

	handleScreenSharing = e => {
		// getWindowInfo and open Modal
		let list = this.rtcEngine.getScreenInfo();

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

	startGame = async (quizRole) => {
		console.log('startGame:: state', this.state, 'quizRole', quizRole);

		const { state, signal } = this;

		if (state.quizIsOn && quizRole != state.quizRole) {
			return;
		}

		if (state.quizIsOn) {
			this.handleLeave();

			return this.setState({ quizIsOn: false, quizRole: null, game_role: null, game_status: null, current_state: null });
		}

        await signal.login(PLAYER_ID);

        console.log('Joining as', quizRole, 'state.quizRole', state.quizRole);
        
		if (quizRole === QUIZ_ROLE_HOST) {
			await this.startNewGame();
		}
		else if (quizRole === QUIZ_ROLE_PLAYER || quizRole === QUIZ_ROLE_AUDIENCE) {
			await this.joinGame(quizRole);
		}
		else {
			console.log('ERROR: Unknown quizRole', quizRole);
		}
	}

	setGameStatus = async () => {
		const { state, signal } = this;

        const { game_status } = state;
        
        game_status.requestId = shortid.generate();

		let result = await this.setChannelAttribute('game_status', JSON.stringify(game_status));

		console.log('setGameStatus:: 2222 result', result);
	};

	handleStartQuiz = async () => {
		console.log('handleStartQuiz::');

		const { state, signal } = this;

		const { game_status } = state;

		console.log('game_status', game_status)

		if (game_status.state === GAME_STATUS_WAIT_FOR_PLAYERS) {
			game_status.state = GAME_STATUS_STARTED;
		}
		else {
			console.log('handleStartQuiz:: invalid game state. Expecting', GAME_STATUS_WAIT_FOR_PLAYERS, 'but got', game_status.state);
		}

        this.setState({});
        
        await this.setGameStatus();
	};

	handleEndQuiz = () => {
		console.log('handleEndQuiz::');

		const { state, signal } = this;

		const { game_status } = state;

		game_status.state = GAME_STATUS_ENDED;

		this.setState({});
	}

	setChannelAttribute = (key, val) => {
		return this.signal.invoke('io.agora.signal.channel_set_attr', { channel: GAME_ID, name: key, value: val });
    }
    
    setupNewGame = () => {
        const { state, signal } = this;
        
        state.game_status = {state: GAME_STATUS_INITIALISED};

        ['host', 'player1', 'player2', 'player3'].map(game_role => {
            delete state[`${game_role}_video_stream_id`];
        });

        delete state.game_role;
        delete state.quizIsOn;
        delete state.quizRole;
        delete state.video_stream_id;

        state.next_question = "";
        state.next_question_answers = [];
    }

	startNewGame = async () => {
        const { state, signal } = this;

        console.log('startNewGame:: state', state);

        this.setupNewGame();

		const { game_status } = state;

		GAME_ID = shortid.generate();

		console.log('GAME_ID', GAME_ID);

		const channel = await signal.join(GAME_ID);

		console.log('=-=-=-=-=-=-=-=-=-=-=-=- channel', channel);

		let result = await signal.invoke('io.agora.signal.channel_query_userlist', { name: GAME_ID });

		console.log('1111 result', result)

		if (result.list && result.list.length === 1 && result.list[0][0] === PLAYER_ID) {
			state.channel = channel;

			game_status.state = GAME_STATUS_WAIT_FOR_PLAYERS;

			game_status.host_player_id = PLAYER_ID;

            console.log('Created a new game successfully.');

            await this.setGameStatus();

            this.setState({ quizIsOn: true, quizRole: QUIZ_ROLE_HOST, GAME_ID, channel });
		}
		else {
			console.log('ERROR: Channel', GAME_ID, 'is not empty or owned by someone else.');
		}
	}

	joinGame = async (quizRole) => {
        const { state, signal } = this;
        
        console.log('joinGame:: state', state);
        
        this.setupNewGame();

		GAME_ID = state.GAME_ID;

		if (!GAME_ID) {
			console.log("ERROR:: Required GAME_ID missing");

			return;
		}

        try {
            const channel = await signal.join(GAME_ID);

            console.log('=-=-=-=-=-=-=-=-=-=-=-=- channel', channel);
            
            let start = new Date();
            
            let game_role, reason, wait_for_game_status;
                        
            this.setState({channel, current_state: "Joining game ... Please wait."});

            if (quizRole === QUIZ_ROLE_PLAYER) {
                this.setState({ quizIsOn: true, quizRole, GAME_ID });

                wait_for_game_status = true;
            }
            else if (quizRole === QUIZ_ROLE_AUDIENCE) {
                this.setState({ quizIsOn: true, quizRole, GAME_ID });

                this.handleJoin();

                return;
            }

            let timer_id = setInterval(async () => {
                const {state} = this;

                if (wait_for_game_status && (state.game_status && state.game_status.state)) {
                    wait_for_game_status = false;

                    console.log('12121212 state.game_status', state.game_status);

                    await signal.sendMessage(state.game_status.host_player_id, "assign_player");

                    console.log('23232323 state.game_status', state.game_status);
                }

                if (state.game_role === QUIZ_ROLE_PLAYER && state.game_status) {
                    let player_count = 0;

                    _.times(4).map(i => {
                        if (state.game_status[`player${i+1}_player_id`] === PLAYER_ID) {
                            game_role = `player${i+1}`
                        }

                        if (state.game_status[`player${i+1}_player_id`]) {
                            player_count++;
                        }
                    });

                    if (state.game_status && state.game_status.state === GAME_STATUS_ENDED) {
                        reason = "Game already ended";
                    }
                    else if (player_count === 3) {
                        reason = "Game is full";
                    }
                }
                else if (state.game_role === QUIZ_ROLE_AUDIENCE) {
                    game_role = "Audience."
                }
                
                if (reason || game_role || (new Date() - start) >= 10000) {
                    console.log('joinGame:: state.game_status', state.game_status, 'game_role', game_role);

                    if (game_role) {
                        console.log('Successfully joined game as', game_role);

                        this.setState({ quizIsOn: true, quizRole: QUIZ_ROLE_PLAYER, GAME_ID, current_state: `Joined and awaiting quiz start from host.` });

                        this.handleJoin();

                        await this.setupVideoPanels();
                    }
                    else {
                        console.log('ERROR: Unable to join game' + (reason ? ` (Reason: ${reason})` : ""));

                        this.setState({current_state: 'ERROR: Unable to join game' + (reason ? ` (Reason: ${reason})` : "")});
                    }

                    clearInterval(timer_id);
                }
            }, 100);
        }
        catch (e) {
            console.log('joinGame:: ERROR:', e);
        }
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
    
    handleSelectAnswer = async (answer) => {
        const {state, signal} = this;

        if (state.quizRole === QUIZ_ROLE_AUDIENCE) {
            return; // audience are not allowed to select answer
        }
    
        if (state.quizRole === QUIZ_ROLE_PLAYER) {
            await signal.sendMessage(state.game_status.host_player_id, "answer,"+answer);
        }

        this.setState({selected_answer : answer});
    };

    handleSetQuestion = async (e) => {
        // console.log('handleSetQuestion:: e', e);
        // console.log('e.target.value', e.target.value);

        this.state.next_question = e.target.value;
    };

    handleSetQuestionOptions = async (index, value) => {
        // console.log('handleSetQuestionOptions:: index, value', index, value);

        this.state.next_question_answers[index] = value;

        this.setState({});
    };

    handleSendNextQuestion = async () => {
        const {state, signal} = this;
        const {game_status} = state;

        await this.handleReceiveQuestionFromHost(state.next_question, [...state.next_question_answers]);

        game_status.questionId = shortid.generate();
        game_status.question = state.next_question;
        game_status.question_answers = [...state.next_question_answers];
        delete game_status.answer;

        _.times(3).map(i => {
            let player_key = 'player' + (i+1);

            delete game_status[`${player_key}_correct_answer`];
            delete game_status[`${player_key}_answered`];
            delete state[`${player_key}_answer`];
        });

        await this.setGameStatus();

        this.setState({selected_answer: null});
    };

    handleSendQuestionAnswer = async () => {
        const {state} = this;

        if (!(state.selected_answer >= 0)) {
            return console.log('Please select answer');
        }

        state.game_status.answer = state.selected_answer;

        _.times(3).map(i => {
            let player_key = 'player' + i;

            state.game_status[`${player_key}_correct_answer`] = state[`${player_key}_answer`] >= 0 && state[`${player_key}_answer`] == state.selected_answer;
        });

        await this.setGameStatus();
    };

    handleReceiveQuestionFromHost = async (question, question_answers) => {
        // console.log('handleReceiveQuestionFromHost:: question, question_answers', question, question_answers)
        this.setState({
            question, question_answers
        })
    };

	render() {
        console.log("App.render::");

        const { state } = this;
        const { game_status, selected_answer, game_role } = state;

		let windowPicker

		if (state.showWindowPicker) {
			windowPicker = <WindowPicker
				onSubmit={this.handleWindowPicker}
				onCancel={e => this.setState({ showWindowPicker: false })}
				windowList={state.windowList}
			/>
		}

		// console.log('state', state);
		// console.log('state.users', state.users);

		// console.log('require(\'../player.jpg\')', require('../player.jpg'))

		return (
            <div className="" style={{_background: 'green'}}>

{/* <div class="row" style={{width: '100%'}}>
    <div class="col-sm-3" style={{background: 'blue'}}>
      1 of 3
    </div>
    <div class="col w-100" style={{background: 'white'}}>
      Variable width content
    </div>
  </div> */}

			<div className="columns" style={{ width: '100%', padding: "20px", height: '100%', margin: '0' }}>

				{state.showWindowPicker ? windowPicker : ''}

				<div className="column is-one-quarter" style={{ overflowY: 'auto' }}>
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
									<input onChange={e => this.setState({ GAME_ID: e.currentTarget.value })} value={state.GAME_ID} className="input" type="text" placeholder="Input a channel name" />
								) : GAME_ID
							}
						</div>
					</div>
					<div className="field">
						<label className="label">Role</label>
						<div className="control">
							<div className="select" style={{ width: '100%' }}>
								<select onChange={e => this.setState({ role: Number(e.currentTarget.value) })} value={state.role} style={{ width: '100%' }}>
									<option value={1}>Anchor</option>
									<option value={2}>Audience</option>
								</select>
							</div>
						</div>
					</div>
					<div className="field">
						<label className="label">VideoProfile</label>
						<div className="control">
							<div className="select" style={{ width: '100%' }}>
								<select onChange={this.handleVideoProfile} value={state.videoProfile} style={{ width: '100%' }}>
									{videoProfileList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
								</select>
							</div>
						</div>
					</div>
					<div className="field">
						<label className="label">AudioProfile</label>
						<div className="control">
							<div className="select" style={{ width: '50%' }}>
								<select onChange={this.handleAudioProfile} value={state.audioProfile} style={{ width: '100%' }}>
									{audioProfileList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
								</select>
							</div>
							<div className="select" style={{ width: '50%' }}>
								<select onChange={this.handleAudioScenario} value={state.audioScenario} style={{ width: '100%' }}>
									{audioScenarioList.map(item => (<option key={item.value} value={item.value}>{item.label}</option>))}
								</select>
							</div>
						</div>
					</div>
					<div className="field">
						<label className="label">Camera</label>
						<div className="control">
							<div className="select" style={{ width: '100%' }}>
								<select onChange={this.handleCameraChange} value={state.camera} style={{ width: '100%' }}>
									{state.videoDevices.map((item, index) => (<option key={index} value={index}>{item.devicename}</option>))}
								</select>
							</div>
						</div>
					</div>
					<div className="field">
						<label className="label">Microphone</label>
						<div className="control">
							<div className="select" style={{ width: '100%' }}>
								<select onChange={this.handleMicChange} value={state.mic} style={{ width: '100%' }}>
									{state.audioDevices.map((item, index) => (<option key={index} value={index}>{item.devicename}</option>))}
								</select>
							</div>
						</div>
					</div>
					<div className="field">
						<label className="label">Loudspeaker</label>
						<div className="control">
							<div className="select" style={{ width: '100%' }}>
								<select onChange={this.handleSpeakerChange} value={state.speaker} style={{ width: '100%' }}>
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
					<hr />
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
							<button onClick={e => this.startGame(QUIZ_ROLE_HOST)} id="host-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_HOST) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_HOST ? 'stop' : 'start'}</button>
						</div>
					</div>
					<div className="field">
						<label className="label">Answer Quiz</label>
						<div className="control">
							<button onClick={e => this.startGame(QUIZ_ROLE_PLAYER)} id="participant-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_PLAYER) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_PLAYER ? 'stop' : 'start'}</button>
						</div>
					</div>
					<div className="field">
						<label className="label">Watch Quiz</label>
						<div className="control">
							<button onClick={e => this.startGame(QUIZ_ROLE_AUDIENCE)} id="audience-button" className={"button " + ((!state.quizIsOn || state.quizRole == QUIZ_ROLE_AUDIENCE) && ' is-link' || '')}>{state.quizIsOn && state.quizRole == QUIZ_ROLE_AUDIENCE ? 'stop' : 'start'}</button>
						</div>
					</div>
                    {state.quizRole === QUIZ_ROLE_HOST ? (
                        <div className="field">
                            <div className="control">
                                <button onClick={game_status.state === GAME_STATUS_STARTED && this.handleEndQuiz || this.handleStartQuiz} className={"button" + ((state.quizRole === QUIZ_ROLE_HOST) && ' is-link' || '')}>{state.quizIsOn && state.quizRole === QUIZ_ROLE_HOST && game_status.state === GAME_STATUS_STARTED ? 'End Quiz' : 'Start Quiz'}</button>
                            </div>
                        </div>
                    ) : "" }
                    {state.quizRole === QUIZ_ROLE_HOST && game_status.state === GAME_STATUS_STARTED ? (
                        <div>
                            <div className="field">
                                <div className="control">
                                    <textarea onChange={this.handleSetQuestion} style={{width: "-webkit-fill-available", height: "10em"}}></textarea>
                                </div>
                            </div>
                            <div className="field">
                                <label className="label">Answer Choices</label>
                                {_.times(4).map(id => {
                                    return (
                                        <div key={id} className="control">
                                            Option {'ABCD'.charAt(id)}: <textarea key={id} onChange={e => this.handleSetQuestionOptions(id, e.target.value)} value={state.next_question_answers[id]} className="input" type="text" placeholder={`Input Question Answer Option ${'ABCD'.charAt(id)}`} />
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="field">
                                <div className="control">
                                    <button onClick={this.handleSendNextQuestion} className={"button " + ((state.quizIsOn && state.quizRole == QUIZ_ROLE_HOST) && ' is-link' || '')}>Send Question</button>
                                </div>
                            </div>
                            <div className="field">
                                <div className="control">
                                    <button onClick={this.handleSendQuestionAnswer} className={"button " + ((state.quizIsOn && state.quizRole == QUIZ_ROLE_HOST) && ' is-link' || '')}>Give Answer</button>
                                </div>
                            </div>
                        </div>
                    ) : ""}
				</div>
				<div className="" style={{width: "-webkit-fill-available", height: "fit-content", _border: "1px solid yellow"}}>
					<div>
						<div className="" style={{width: "-webkit-fill-available", height: "45em", _border: "1px solid yellow"}}>
						{state.question ? (
							<QuestionPanel question={state.question} question_answers={state.question_answers || []} game_status={game_status} answer_from_host={state.answer_from_host} onSelectAnswer={this.handleSelectAnswer} selected_answer={selected_answer}></QuestionPanel>
						) : (
							<div style={{height: "-webkit-fill-available", fontSize: "5em", textAlign: "center"}}>
								{/* WELCOME!<div style={{display: "block", fontSize: ".5em", visibility: "hidden"}}>1</div>
								A Quiz Game <div style={{display: "block", fontSize: ".5em", visibility: "hidden"}}>1</div>
								via Agora Video <div style={{display: "block", fontSize: ".5em", visibility: "hidden"}}>1</div>
								and Agora Signaling SDK */}
							</div>
						)}
						</div>
						<div className="game-status" style={{ display: "block", margin: ".5em", fontSize: "2em"}}>
							{(() => {
								if (state.quizIsOn) {
									return QUIZ_STATUS_TEXT[game_status.state];
								}
								else {
									return state.current_state || "Choose if you wan to be the Host, Contestant or Audience";
								}
							})()}
						</div>
						{state.quizIsOn || state.quizRole === QUIZ_ROLE_AUDIENCE ? (
							<div style={{height: "250px", animationName: "example", animationDuration: "2s", _border: "1px dashed red", overflow: "hidden"}}>
								<div className="column is-three-quarters window-container" style={{columnGap: ".3em", }}>
									{_.times(4).map((item, key) => {
                                        let player_key = ['host', 'player1', 'player2', 'player3'][item]; 
                                        
                                        return (
                                            <Window 
                                                harold_trace="1111" 
                                                key={key} 
                                                game_role={player_key} 
                                                uid={game_status[`${player_key}_video_stream_id`]} 
                                                rtcEngine={this.rtcEngine} 
                                                player_id={game_status[`${player_key}_player_id`]} 
                                                role={game_status[`${player_key}_video_stream_id`] === state.video_stream_id ? 'local' : 'remote'} 
                                                answer={game_role === QUIZ_ROLE_HOST ? (state[player_key + '_answer'] >= 0 && 'ABCD'.charAt(state[player_key + '_answer'])) :  (game_status[player_key + "_answered"] ? (!state.answer_from_host ? "👌🏻" : (game_status[`${player_key}_correct_answer`] ? "👍🏻" : (game_status[`${player_key}_player_id`] ? "👎🏻" : ""))) : "")}
                                            />
                                        )
                                    })}

									{/* {state.local ? (<Window harold_trace="2222" uid={state.local} rtcEngine={this.rtcEngine} role="local"></Window>) : ''} */}

									{/* {state.localVideoSource ? (<Window harold_trace="3333" uid={state.localVideoSource} rtcEngine={this.rtcEngine} role="localVideoSource"></Window>) : ''} */}
								</div>                                    
							</div>
						) : ""}
					</div>
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

		console.log('Window.constructor:: props', props);
	}

	// componentDidMount() {
    //     if (!this.props.uid) {
    //         return;
    //     }

	// 	let dom = document.querySelector(`#video-${this.props.uid}`);

	// 	console.log('Window.componentDidMount:: dom', dom);

	// 	if (this.props.role === 'local') {
	// 		dom && this.props.rtcEngine.setupLocalVideo(dom)
	// 	} 
	// 	// else if (this.props.role === 'localVideoSource') {
	// 	//     dom && this.props.rtcEngine.setupLocalVideoSource(dom)

	// 	// 	this.props.rtcEngine.setupViewContentMode('videosource', 1);
	// 	// 	this.props.rtcEngine.setupViewContentMode(String(SHARE_ID), 1);
	// 	// } 
	// 	else if (this.props.role === 'remote') {
	// 		dom && this.props.rtcEngine.subscribe(this.props.uid, dom)
	// 	} 
	// 	// else if (this.props.role === 'remoteVideoSource') {
	// 	// 	dom && this.props.rtcEngine.subscribe(this.props.uid, dom)
	// 	// 	this.props.rtcEngine.setupViewContentMode('videosource', 1);
	// 	// 	this.props.rtcEngine.setupViewContentMode(String(SHARE_ID), 1);
	// 	// }
	// }

	render() {
        const {player_id, game_role, answer} = this.props;

        console.log('Window.render:: props', this.props, 'state', this.state);

        setTimeout(() => {
            if (this.props.uid && this.props.uid !== this.state.uid && this.props.player_id) {
                this.state.uid = this.props.uid;
    
                let dom = document.querySelector(`#video-${this.props.game_role}`);
    
                console.log('Window.render:: dom', dom);
        
                if (this.props.role === 'local') {
                    dom && this.props.rtcEngine.setupLocalVideo(dom)
                } 
                // else if (this.props.role === 'localVideoSource') {
                //     dom && this.props.rtcEngine.setupLocalVideoSource(dom)
        
                // 	this.props.rtcEngine.setupViewContentMode('videosource', 1);
                // 	this.props.rtcEngine.setupViewContentMode(String(SHARE_ID), 1);
                // } 
                else if (this.props.role === 'remote') {
                    dom && this.props.rtcEngine.subscribe(this.props.uid, dom)
                } 
            }            
        }, 100);

        let display_name = "...";

        if (this.props.player_id) {
            display_name = this.props.game_role.charAt(0).toUpperCase() + this.props.game_role.slice(1) + (player_id === PLAYER_ID ? " (ME)": "");
        }

		return (
			<div className="window-item box" style={{ border: "1px solid red" }} haa-trace={this.props.harold_trace}>
                {this.props.uid ? (
                    <div className="video-item is-fluid" id={'video-' + this.props.game_role}></div>
                ) : (
                    <img className="player-icon" style={{ verticalAlign: "middle", magin: "auto", height: "-webkit-fill-available", display: "block"}} src={require('../player.jpg')} />
                )}
                <div className="game_role">{display_name}</div>
                {answer ? 
                    <div className="player_answer_tab">{answer}</div>
                : ""}
			</div>
		)
	}
}

