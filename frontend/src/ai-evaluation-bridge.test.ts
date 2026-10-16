import { expect, it } from 'vitest';
import { readAiEvaluation } from './ai-evaluation-bridge';
it('only 404 maps to absent evaluation', async()=>{
  expect(await readAiEvaluation(new Response('{}',{status:404}))).toBeNull();
});
it.each([undefined, new Response('{}',{status:403}), new Response('{}',{status:500})])('lookup failures remain failures: %s',async response=>{
  await expect(readAiEvaluation(response)).rejects.toThrow('Evaluation lookup failed');
});
it('malformed successful JSON is not an absent evaluation',async()=>{
  await expect(readAiEvaluation(new Response('invalid'))).rejects.toThrow();
});
it('successful lookup preserves the live DTO',async()=>{
  const value={employee:{id:2},reviewer:{id:1},state:'FINALIZED',items:[],selfAnswers:[],managerAnswers:[]};
  expect(await readAiEvaluation(Response.json(value))).toEqual(value);
});
