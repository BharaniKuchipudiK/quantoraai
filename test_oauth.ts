import handler from './api/auth/verify.ts';

async function run() {
  const req = {
    method: 'POST',
    body: { credential: 'fake.jwt.token' }
  };
  
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log(`Status: ${this.statusCode}`);
      console.log(`Data:`, data);
      return this;
    },
    setHeader: () => {}
  };

  await handler(req, res);
}

run();
