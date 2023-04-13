from __future__ import print_function, unicode_literals

import requests
from PyInquirer import style_from_dict, Token, prompt, Separator

style = style_from_dict({
    Token.Separator: '#cc5454',
    Token.QuestionMark: '#673ab7 bold',
    Token.Selected: '#cc5454',  # default
    Token.Pointer: '#673ab7 bold',
    Token.Instruction: '',  # default
    Token.Answer: '#f44336 bold',
    Token.Question: '',
})

action_questions = [
    {
        'type': 'list',
        'message': 'Select Action',
        'name': 'action',
        'choices': [
            Separator('=== Actions ==='),
            {
                'name': 'Current rules',
                'value': 'current_rules',
            },
            {
                'name': 'Apply rule',
                'value': 'apply_rule',
            },
            {
                'name': 'Delete all rules',
                'value': 'delete_rules',
            },

        ],
        'validate': lambda answer: 'You must choose at least one option.' \
            if len(answer) == 0 else True
    }
]
apply_rule_questions = [
    {
        'type': 'list',
        'message': 'Select Rules',
        'name': 'apply_rule',
        'choices': [
            Separator('=== Rules ==='),
            {
                'name': '1) Limit (bandwidth or rate limit for the worker)',
                'value': 'limit',
            },
            {
                'name': '2) Delay (length of time packets will be delayed)',
                'value': 'delay',
            },
            {
                'name': '3) Loss (percentage loss probability to the packets outgoing)',
                'value': 'loss',
            },
            {
                'name': '4) Duplicate (percentage value of network packets to be duplicated)',
                'value': 'duplicate',
            },
            {
                'name': '5) Corrupt (emulation of random noise introducing an error)',
                'value': 'corrupt',
            },
        ],
        'validate': lambda answer: 'You must choose at least one option.' \
            if len(answer) == 0 else True
    }
]
apply_rule_input_questions = {
    'limit': [
        {
            'type': 'input',
            'name': 'limit',
            'message': 'Accepts a floating point number, followed by a unit, or a percentage value of the device\'s speed (e.g. 70.5%).\n'
                       'Following units are recognized:\n'
                       '* bit, kbit, mbit, gbit, tbit\n'
                       '* bps, kbps, mbps, gbps, tbps\n'
                       'ex) 1mbps or 70.5%',
        }
    ],
    'delay': [
        {
            'type': 'input',
            'name': 'delay',
            'message': 'Accepts a floating point number followed by an optional unit:\n'
                       '* s, sec, secs\n'
                       '* ms, msec, msecs\n'
                       '* us, usec, usecs or a bare number\n'
                       'ex) 100ms',
        }
    ],
    'loss': [
        {
            'type': 'input',
            'name': 'loss',
            'message': 'Accepts percentage loss probability to the packets outgoing from the chosen network interface:\n'
                       'ex) 50%',
        }
    ],
    'duplicate': [
        {
            'type': 'input',
            'name': 'duplicate',
            'message': 'Accepts percentage value of network packets to be duplicated before queueing:\n'
                       'ex) 30%',
        }
    ],
    'corrupt': [
        {
            'type': 'input',
            'name': 'corrupt',
            'message': 'Accepts emulation of random noise introducing an error in a random position for a chosen percent of packets:\n'
                       'ex) 10%',
        }
    ]
}


def compose_data(rule_set: dict):
    data = ""
    for k in rule_set.keys():
        if len(data) == 0:
            data = f"{k}={rule_set[k]}"
            continue
        data += f"&{k}={rule_set[k]}"
    return data


if __name__ == '__main__':
    OKBLUE = '\033[94m'
    BASE_API_URL = "<FILL_THIS_PART>"  # e.g http://iotfa-lb8a1-15491mhxo6avf-1922776115.ap-northeast-2.elb.amazonaws.com:4080
    RULE_SET = {}
    while True:
        try:
            answer = prompt(action_questions, style=style)
            if answer['action'] == 'current_rules':
                res = requests.get(BASE_API_URL + '/locust-tc-worker')
                res.raise_for_status()
                print(OKBLUE + res.text)
                continue
            if answer['action'] == 'apply_rule':
                answer = prompt(apply_rule_questions, style=style)
                rule = answer['apply_rule']
                if rule == 'limit':
                    answer = prompt(apply_rule_input_questions['limit'])
                    RULE_SET["rate"] = answer["limit"]
                if rule == 'delay':
                    answer = prompt(apply_rule_input_questions['delay'])
                    RULE_SET["delay"] = answer["delay"]
                if rule == 'loss':
                    answer = prompt(apply_rule_input_questions['loss'])
                    RULE_SET["loss"] = answer["loss"]
                if rule == 'duplicate':
                    answer = prompt(apply_rule_input_questions['duplicate'])
                    RULE_SET["duplicate"] = answer["duplicate"]
                if rule == 'corrupt':
                    answer = prompt(apply_rule_input_questions['corrupt'])
                    RULE_SET["corrupt"] = answer["corrupt"]
                res = requests.post(BASE_API_URL + '/locust-tc-worker', data=compose_data(RULE_SET))
                res.raise_for_status()
                print(OKBLUE + res.text)
                continue
            if answer['action'] == 'delete_rules':
                res = requests.delete(BASE_API_URL + '/locust-tc-worker')
                res.raise_for_status()
                RULE_SET = {}
                print(OKBLUE + "All Deleted")
                continue
        except KeyboardInterrupt:
            break
