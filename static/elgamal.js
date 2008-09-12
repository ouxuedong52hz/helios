
//
// inspired by George Danezis, rewritten by Ben Adida.
//

ElGamal = {};

ElGamal.Params = Class.extend({
  init: function(p, q, g) {
    this.p = p;
    this.q = q;
    this.g = g;
  },
  
  generate: function() {
    // get the value x
    var x = Random.getRandomInteger(this.q);
    var y = this.g.modPow(x, this.p);
    var pk = new ElGamal.PublicKey(this.p, this.q, this.g, y);
    var sk = new ElGamal.SecretKey(x, pk);
    return sk;
  },
  
  toJSONObject: function() {
    return {g: this.g.toJSONObject(), p: this.p.toJSONObject(), q: this.q.toJSONObject()};
  }
});

ElGamal.Params.fromJSONObject = function(d) {
  var params = new ElGamal.Params();
  params.p = BigInt.fromJSONObject(d.p);
  params.q = BigInt.fromJSONObject(d.q);
  params.g = BigInt.fromJSONObject(d.g);
  return params;
};

ElGamal.PublicKey = Class.extend({
  init : function(p,q,g,y) {
    this.p = p;
    this.q = q;
    this.g = g;
    this.y = y;
  },
  
  toJSONObject: function() {
    return {g : this.g.toJSONObject(), p : this.p.toJSONObject(), q : this.q.toJSONObject(), y : this.y.toJSONObject()};
  },
  
  verifyKnowledgeOfSecretKey: function(proof, challenge_generator) {
    // if challenge_generator is present, we have to check that the challenge was properly generated.
    if (challenge_generator != null) {
      if (!proof.challenge.equals(challenge_generator(proof.s))) {
        return false;
      }
    }
    
    // verify that g^response = s * y^challenge
    var check = this.g.modPow(proof.response, this.p).equals(this.y.modPow(proof.challenge, this.p).multiply(proof.s).mod(this.p));
    
    return check;
  },
  
  multiply: function(other) {
    // base condition
    if (other == 0 || other == 1) {
      return this;
    }
    
    // check params
    if (!this.p.equals(other.p))
      throw "mismatched params";
    if (!this.g.equals(other.g))
      throw "mismatched params";
    
    var new_pk = new ElGamal.PublicKey(this.p, this.q, this.g, this.y.multiply(other.y).mod(this.p));
    return new_pk;
  }
  
});

ElGamal.PublicKey.fromJSONObject = function(d) {
  var pk = new ElGamal.PublicKey();
  pk.p = BigInt.fromJSONObject(d.p);
  pk.q = BigInt.fromJSONObject(d.q);
  pk.g = BigInt.fromJSONObject(d.g);
  pk.y = BigInt.fromJSONObject(d.y);
  return pk;
};

ElGamal.SecretKey = Class.extend({
  init: function(x, pk) {
    this.x = x;
    this.pk = pk;
  },
  
  toJSONObject: function() {
    return {pk: this.pk.toJSONObject(), x: this.x.toJSONObject()};
  },
  
  decrypt: function(ciphertext) {
    var m = ciphertext.alpha.modPow(this.x, this.pk.p).modInverse(this.pk.p).multiply(ciphertext.beta).mod(this.pk.p);
    var plaintext = new ElGamal.Plaintext(m, this.pk, false);
    return plaintext;
  },
  
  decryptAndProve: function(ciphertext, challenge_generator) {
    var plaintext = this.decrypt(ciphertext);

    // generate random w
    var w = Random.getRandomInteger(this.pk.q);
    
    var proof = new ElGamal.Proof();
    
    // compute A=g^w, B=\alpha^w
    proof.commitment.A = this.pk.g.modPow(w, this.pk.p);
    proof.commitment.B = ciphertext.alpha.modPow(w, this.pk.p);
    
    // Get the challenge from the callback that generates it
    proof.challenge = challenge_generator(proof.commitment);
    
    // Compute response = w + x * challenge
    proof.response = w.add(this.x.multiply(proof.challenge).mod(this.pk.q));
    
    return {
      'plaintext': plaintext,
      'proof': proof
    };
  },
  
  // generate a proof of knowledge of the secret exponent x
  proveKnowledge: function(challenge_generator) {
    // generate random w
    var w = Random.getRandomInteger(this.pk.q);

    // FIXME: build an abstraction for this single PoK of discrete log
    var proof = {};
    
    // compute s = g^w for random w.
    proof.s = this.pk.g.modPow(w, this.pk.p);
    
    // get challenge
    proof.challenge = challenge_generator(proof.s);
    
    // compute response = w +  x * challenge
    proof.response = w.add(this.x.multiply(proof.challenge).mod(this.pk.q));
    
    return proof;
  }
});

ElGamal.SecretKey.fromJSONObject = function(d) {
  var sk = new ElGamal.SecretKey();
  sk.pk = ElGamal.PublicKey.fromJSONObject(d.pk);
  sk.x = BigInt.fromJSONObject(d.x);
  return sk;
}

ElGamal.Ciphertext = Class.extend({
  init: function(alpha, beta, pk) {
    this.alpha = alpha;
    this.beta = beta;
    this.pk = pk;
  },
  
  toString: function() {
    return this.alpha.toString() + ',' + this.beta.toString();
  },
  
  toJSONObject: function() {
    return {alpha: this.alpha.toJSONObject(), beta: this.beta.toJSONObject()}
  },
  
  multiply: function(other) {
    // special case if other is 1 to enable easy aggregate ops
    if (other == 1)
      return this;
    
    // homomorphic multiply
    return new ElGamal.Ciphertext(this.alpha.multiply(other.alpha).mod(this.pk.p),
                                  this.beta.multiply(other.beta).mod(this.pk.p),
                                  this.pk);
  },
  
  generateProof: function(plaintext, randomness, challenge_generator) {
    // generate random w
    var w = Random.getRandomInteger(this.pk.q);
    
    var proof = new ElGamal.Proof();
    
    // compute A=g^w, B=y^w
    proof.commitment.A = this.pk.g.modPow(w, this.pk.p);
    proof.commitment.B = this.pk.y.modPow(w, this.pk.p);
    
    // Get the challenge from the callback that generates it
    proof.challenge = challenge_generator(proof.commitment);
    
    // Compute response = w + randomness * challenge
    proof.response = w.add(randomness.multiply(proof.challenge).mod(this.pk.q));
    
    return proof;
  },
  
  simulateProof: function(plaintext, challenge) {
    // generate a random challenge if not provided
    if (challenge == null) {
      challenge = Random.getRandomInteger(this.pk.q);
    }
    
    // compute beta/plaintext, the completion of the DH tuple
    var beta_over_plaintext = this.beta.multiply(plaintext.m.modInverse(this.pk.p));
    
    // random response, does not even need to depend on the challenge
    var response = Random.getRandomInteger(this.pk.q);

    // now we compute A and B
    var A = this.alpha.modPow(challenge, this.pk.p).modInverse(this.pk.p).multiply(this.pk.g.modPow(response, this.pk.p));
    var B = beta_over_plaintext.modPow(challenge, this.pk.p).modInverse(this.pk.p).multiply(this.pk.y.modPow(response, this.pk.p));
    
    return new ElGamal.Proof(A, B, challenge, response);
  },
  
  verifyProof: function(plaintext, proof, challenge_generator) {
    // check that g^response = A * alpha^challenge
    var first_check = this.pk.g.modPow(proof.response, this.pk.p).equals(this.alpha.modPow(proof.challenge, this.pk.p).multiply(proof.commitment.A).mod(this.pk.p));
    
    // check that y^response = B * (beta/m)^challenge
    var beta_over_m = this.beta.multiply(plaintext.m.modInverse(this.pk.p)).mod(this.pk.p);
    var second_check = this.pk.y.modPow(proof.response, this.pk.p).equals(beta_over_m.modPow(proof.challenge, this.pk.p).multiply(proof.commitment.B).mod(this.pk.p));
    
    var third_check = true;
    
    if (challenge_generator) {
      third_check = proof.challenge.equals(challenge_generator(proof.commitment));
    }
    
    return (first_check && second_check && third_check);
  },

  verifyDecryptionProof: function(plaintext, proof, challenge_generator) {
    // this is different because we're proving the tuple (g, y, alpha, beta/m), rather than (g, alpha, y, beta/m)
    
    // check that g^response = A * y^challenge
    var first_check = this.pk.g.modPow(proof.response, this.pk.p).equals(this.pk.y.modPow(proof.challenge, this.pk.p).multiply(proof.commitment.A).mod(this.pk.p));
    
    // check that alpha^response = B * (beta/m)^challenge
    var beta_over_m = this.beta.multiply(plaintext.m.modInverse(this.pk.p)).mod(this.pk.p);
    var second_check = this.alpha.modPow(proof.response, this.pk.p).equals(beta_over_m.modPow(proof.challenge, this.pk.p).multiply(proof.commitment.B).mod(this.pk.p));
    
    var third_check = true;
    
    if (challenge_generator) {
      third_check = proof.challenge.equals(challenge_generator(proof.commitment));
    }
    
    return (first_check && second_check && third_check);
  },
  
  generateDisjunctiveProof: function(list_of_plaintexts, real_index, randomness, challenge_generator) {
    // go through all plaintexts and simulate the ones that must be simulated.
    // note how the interface is as such so that the result does not reveal which is the real proof.
    var self = this;
    var proofs = $(list_of_plaintexts).map(function(p_num, plaintext) {
      if (p_num == real_index) {
        // no real proof yet
        return {};
      } else {
        // simulate!
        return self.simulateProof(plaintext);
      }
    });
    
    // do the real proof
    var real_proof = this.generateProof(list_of_plaintexts[real_index], randomness, function(commitment) {
      // now we generate the challenge for the real proof by first determining
      // the challenge for the whole disjunctive proof.
      
      // set up the partial real proof so we're ready to get the hash;
      proofs[real_index] = {'commitment' : commitment};

      // get the commitments in a list and generate the whole disjunctive challenge
      var commitments = $(proofs).map(function(proof_num, proof) {
        return proof.commitment;
      });
      var disjunctive_challenge = challenge_generator(commitments);
      
      // now we must subtract all of the other challenges from this challenge.
      var real_challenge = disjunctive_challenge;
      $(proofs).each(function(proof_num, proof) {
        if (proof_num != real_index)
          real_challenge = real_challenge.add(proof.challenge.negate());
      });
      
      // make sure we mod q, the exponent modulus
      return real_challenge.mod(self.pk.q);
    });
    
    // set the real proof
    proofs[real_index] = real_proof;
    
    return new ElGamal.DisjunctiveProof(proofs);
  },
  
  verifyDisjunctiveProof: function(list_of_plaintexts, disj_proof, challenge_generator) {
    var result = true;
    var proofs = disj_proof.proofs;
    
    // for loop because we want to bail out of the inner loop
    // if we fail one of the verifications.
    for (var i=0; i < list_of_plaintexts.length; i++) {      
      if (!this.verifyProof(list_of_plaintexts[i], proofs[i]))
        return false;
    }
    
    // check the overall challenge
    
    // first the one expected from the proofs
    var commitments = $(proofs).map(function(proof_num, proof) {return proof.commitment;});
    var expected_challenge = challenge_generator(commitments);
    
    // then the one that is the sum of the previous one.
    var sum = new BigInt("0", 10); var self = this;
    $(proofs).each(function(p_num, proof) {sum = sum.add(proof.challenge).mod(self.pk.q);});
    
    return expected_challenge.equals(sum);    
  },
  
  equals: function(other) {
    return (this.alpha.equals(other.alpha) && this.beta.equals(other.beta));
  }
});

ElGamal.Ciphertext.fromJSONObject = function(d, pk) {
  return new ElGamal.Ciphertext(BigInt.fromJSONObject(d.alpha), BigInt.fromJSONObject(d.beta), pk);
};

// we need the public key to figure out how to encode m
ElGamal.Plaintext = Class.extend({
  init: function(m, pk, encode_m) {
    if (m == null) {
      alert('oy null m');
	    return;
    }

    this.pk = pk;

    if (encode_m) {
      // need to encode the message given that p = 2q+1
      var y = m.add(BigInt.ONE);
      var test = y.modPow(pk.q, pk.p);
      if (test.equals(BigInt.ONE)) {
    	  this.m = y;
      } else {
    	  this.m = y.negate().mod(pk.p);
      }
    } else {
      this.m = m;
    }    
  },
  
  getPlaintext: function() {
    var y;

    // if m < q
    if (this.m.compareTo(this.pk.q) < 0) {
  	  y = this.m;
    } else {
  	  y = this.m.negate().mod(this.pk.p);
    }

    return y.subtract(BigInt.ONE);
  },
  
  getM: function() {
    return this.m;
  }
  
});

//
// Proof abstraction
//

ElGamal.Proof = Class.extend({
  init: function(A, B, challenge, response) {
    this.commitment = {};
    this.commitment.A = A;
    this.commitment.B = B;
    this.challenge = challenge;
    this.response = response;
  },
  
  toJSONObject: function() {
    return {
      commitment : {A: this.commitment.A.toJSONObject(), B: this.commitment.B.toJSONObject()},
      challenge : this.challenge.toJSONObject(),
      response : this.response.toJSONObject()
    }
  }
});

ElGamal.Proof.fromJSONObject = function(d) {
  return new ElGamal.Proof(
    BigInt.fromJSONObject(d.commitment.A),
    BigInt.fromJSONObject(d.commitment.B),
    BigInt.fromJSONObject(d.challenge),
    BigInt.fromJSONObject(d.response));
};

ElGamal.DisjunctiveProof = Class.extend({
  init: function(list_of_proofs) {
    this.proofs = list_of_proofs;
  },
  
  toJSONObject: function() {
    return $(this.proofs).map(function(i, proof) {
      return proof.toJSONObject();
    });
  }
});

ElGamal.DisjunctiveProof.fromJSONObject = function(d) {
  return new ElGamal.DisjunctiveProof(
    $(d).map(function(i, p) {
      return ElGamal.Proof.fromJSONObject(p);
    })
  );
};

ElGamal.encrypt = function(pk, plaintext, r) {
  if (plaintext.getM().equals(BigInt.ZERO))
    throw "Can't encrypt 0 with El Gamal"

  if (!r)
    r = Random.getRandomInteger(pk.q);
  
  var alpha = pk.g.modPow(r, pk.p);
  var beta = (pk.y.modPow(r, pk.p)).multiply(plaintext.m).mod(pk.p);
  
  return new ElGamal.Ciphertext(alpha, beta, pk);
};

// a challenge generator based on a list of commitments of
// proofs of knowledge of plaintext. Just appends A and B with commas.
ElGamal.disjunctive_challenge_generator = function(commitments) {
  var strings_to_hash = [];

  // go through all proofs and append the commitments
  $(commitments).each(function(commitment_num, commitment) {
    // toJSONObject instead of toString because of IE weirdness.
    strings_to_hash[strings_to_hash.length] = commitment.A.toJSONObject();
    strings_to_hash[strings_to_hash.length] = commitment.B.toJSONObject();
  });
  
  // STRINGS = strings_to_hash;
  return new BigInt(hex_sha1(strings_to_hash.join(",")), 16);
};

// a challenge generator for Fiat-Shamir
ElGamal.fiatshamir_challenge_generator = function(commitment) {
  return ElGamal.disjunctive_challenge_generator([commitment]);
};

ElGamal.fiatshamir_dlog_challenge_generator = function(commitment) {
  return new BigInt(hex_sha1(commitment.toJSONObject()), 16);
};