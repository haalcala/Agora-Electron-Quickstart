import React from 'react';
// import {chunk, merge} from 'lodash';
// import PropTypes from 'prop-types';
// import './index.css';

class QuestionPanel extends React.Component {
	state = {
		currentWindowId: -1,
		question: "question  1111 "+
				"asdfdfs " +
				"dfsadfsadfsafa " +
				"dfasdfasfasdfasdfsafasdfasdf " +
				"asdfasdfafasdfsadf " +
				"adfasdfasfsdf ",
		options : ['A. Small', 'B. Medium', 'C. Large', 'D. None of the above']
	}

	handleAnswerClick = (e) => {
		console.log(e);
	}

	render() {
		const {question, options} = this.state;

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
							{options.map(option => {
								return (
									<div>
										<button className="answer-item is-link" onClick={this.handleAnswerClick}>{option}</button>
										<div className="" style={{width: "30em", margin: "auto", display: "block"}}/>
									</div>
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