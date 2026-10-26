import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client'; 
import { HDSandbox } from '@hyperdart/sandbox';
import hDConfig from '../../hyperdart.config';
import resourceJson from '../../resource.json';

const container = document.getElementById('root');
const root = createRoot(container); 
const initialSearchData = [{
  component: hDConfig.name,
  query: '',
  entities: [],
}];

root.render(<HDSandbox config={hDConfig} searchData={initialSearchData} resource={resourceJson} />);