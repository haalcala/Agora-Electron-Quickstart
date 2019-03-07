import React from 'react';
// import {chunk, merge} from 'lodash';
// import PropTypes from 'prop-types';
// import './index.css';
import _ from 'lodash';

class QuestionPanel extends React.Component {
	state = {
		currentWindowId: -1,
		question: "",
		options : [],
	}

	constructor(props) {
		super();
		
        this.state.game_status = props.game_status;
        this.state.selected_answer = props.selected_answer;

        console.log('QuestionPanel.constructor:: props', props);
	}

	selectAnswer = async (answer) => {
        if (this.props.answer_from_host) {
            return;
        }

        console.log(answer);
        
        this.props.onSelectAnswer(answer)
	}

	render() {
        console.log('QuestionPanel.render::');

        const {answer_from_host, question, question_answers, selected_answer} = this.props;

		return (
			<div className="card" style={{ border: "1px solid red", width: "100%", height: "100%", padding: "1em", height: "-webkit-fill-available"}}>
					<div className="card" style={{border: "1px solid green", height: "-webkit-fill-available"}}>
						<div className="card" style={{width: "40em", margin: "auto", display: "block"}}>
							<h1>Question:</h1>
							<h1 style={{textAlign: "center"}}>
								{question}
							</h1>
                            {answer_from_host ? (
                                <div>
                                    <h1>Answer:</h1>
                                    <h1 style={{textAlign: "left", textDecoration: "underline", marginLeft: "3em"}}>
                                        {`${'ABCD'.charAt(answer_from_host)}. ${question_answers[answer_from_host]}`}
                                    </h1>
                                </div>
                            ) : ""}
						</div>
					</div>
					<div style={{visibility: "hidden"}}>1</div>
					<div className="card" style={{border: "1px solid green", display: "block", columnGap: ".3em"}}>
						<div style={{margin: "1em"}}>
							{_.times(4).map(i => {
								return (
                                    <AnswerItem key={i} selected_answer={selected_answer} answer_from_host={answer_from_host} i={i} option={question_answers[i]} selectAnswer={this.selectAnswer}></AnswerItem>
								);
							})}
						</div>
					</div>
			</div>
		);
	}
}

class AnswerItem extends React.Component {
    render() {
        const {selected_answer, answer_from_host, i, option, selectAnswer} = this.props;

        // console.log("selected_answer", selected_answer, "answer_from_host", answer_from_host, "i", i, "option", option, "selectAnswer", selectAnswer);

        return (
            <div className={"column answer-item is-link" + (selected_answer == i ? " selected": "")} onClick={() => selectAnswer(i)} >
                <div style={{display: "inline", width: "1em"}}>
                    {answer_from_host ? (selected_answer == i ? (answer_from_host == selected_answer ? "✔︎" : "✘") : " ") : " "} 
                </div>
                <div key={i} style={{display: "inline", marginLeft: ".2em"}}>
                    {`${'ABCD'.charAt(i)}.  ${option}`}
                </div>
            </div>
        )
    }
}

export default QuestionPanel;