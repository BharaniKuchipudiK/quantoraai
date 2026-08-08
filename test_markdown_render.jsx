import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const text = `
Hello! I am **Quantora AI**.

### Part 1: React vs Vue

| Feature | React | Vue |
| --- | --- | --- |
| Type | UI | Framework |
`;

const html = renderToString(
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
);

console.log(html);
