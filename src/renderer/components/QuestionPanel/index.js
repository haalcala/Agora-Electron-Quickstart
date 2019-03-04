import React from 'react';
// import {chunk, merge} from 'lodash';
// import PropTypes from 'prop-types';
// import './index.css';
import _ from 'lodash';

class QuestionPanel extends React.Component {
	state = {
		currentWindowId: -1,
		question: "question  1111 "+
				"asdfdfs " +
				"dfsadfsadfsafa " +
				"dfasdfasfasdfasdfsafasdfasdf " +
				"asdfasdfafasdfsadf " +
				"adfasdfasfsdf ",
		options : ['A. Small', 'B. Medium', 'C. Large', 'D. None of the above'],
	}

	constructor(props) {
		super();
		
		this.state.game_status = props.game_status;
	}

	selectAnswer = (answer) => {
		console.log(answer);

		this.setState({selected_answer : answer});
	}

	render() {
		const {question, options, selected_answer} = this.state;

		return (
			<div className="card" style={{ position: "absolute", border: "1px solid red", width: "100%", height: "100%", padding: "1em"}}>
				{/* <div className="card" style={{padding: "10px"}}> */}
					<div className="card" style={{border: "1px solid green", height: "-webkit-fill-available"}}>
						<div style={{height: "-webkit-fill-available"}}></div>
						<div className="card" style={{width: "30em", margin: "auto", display: "block"}}>
							<h1>Question:</h1>
							<h1 style={{textAlign: "center"}}>
								{question}
							</h1>
						</div>
						<div style={{height: "-webkit-fill-available"}}></div>
					</div>
					<div style={{visibility: "hidden"}}>1</div>
					<div className="card" style={{border: "1px solid green", height: "23em"}}>
						<div style={{margin: "1em"}}>
							{_.times(4).map(i => {
								return (
									<button id={i} className={"answer-item is-link" + (selected_answer === i ? " selected": "")} onClick={() => this.selectAnswer(i)}>{options[i]}</button>
								);
							})}
						</div>
					</div>
				{/* </div> */}
			</div>
		);
	}
}

export default QuestionPanel;