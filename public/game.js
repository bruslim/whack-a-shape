/*jshint browser:true */
/*global createjs */

var Game = (function() {
  'use strict';
  
  // console polyfill
  var console = window.console || { log: function(){} };
  
  // random int function from mdn
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }
  
  // is function helper
  function isFunction(obj) {
    return obj && typeof(obj) === 'function';
  }
  
  function GameText(text, size) {
    createjs.Text.call(this, text, size + " 'Press Start 2P', cursive");
  }
  GameText.prototype = Object.create(createjs.Text.prototype);
  GameText.prototype.constructor=GameText;
  GameText.prototype.positionCenter = function(canvas, yOffset, textAbove) {
    this.x = canvas.width/2 - this.getMeasuredWidth()/2;
    if (textAbove) {
      this.y = yOffset + textAbove.getMeasuredHeight() + textAbove.y;
    } else {
      this.y = yOffset;
    }
  };
  
  // main state machine
  function Stateful(initialState) {
    this.state = initialState;
    this._eventQueue = [];
    Object.defineProperties(this, {
      currentState: {
        eunerable: true,
        get: function() {
          return this.states[this.state] || {};
        }
      }
    });
    this.trigger('_onEnter', { init: true });
  }
  
  Stateful.prototype.processEventQueue = function() {
    var callback = this._eventQueue.shift();
    if (isFunction(callback)) {
      callback.apply(this);
    }
    if (this._eventQueue.length > 0) {
      requestAnimationFrame(this.processEventQueue.bind(this));
    }
  };
  
  Stateful.prototype.trigger = function(eventType) {
    var self = this;
    var args = Array.prototype.slice.call(arguments,1);
    var handler = this.currentState[eventType];
    if (!isFunction(handler)) { return; }
    this._eventQueue.push(function() {
      handler.apply(self, args);
    });
    requestAnimationFrame(this.processEventQueue.bind(this));
  };
  
  Stateful.prototype.transition = function(nextState) {
    if (!this.states[nextState] || nextState === this.state) { 
      return; 
    }
    this.trigger('_onExit',{ nextState: nextState });
    var previousState = this.state;
    this.state = nextState;
    this.trigger('_onEnter', { previousState: previousState });
  };
  
  // all game objects must have an id
  function GameObject(id, initialState) {
    Object.defineProperties(this,{
      id: {
        value: id,
        enumerable: true,
      }
    }); 
    Stateful.call(this, initialState);
  }
  GameObject.prototype = Object.create(Stateful.prototype);
  GameObject.prototype.constructor = GameObject;
  
  // wrapper for createjs stuff
  function DrawableObject(id, initialState, container) {
    Object.defineProperties(this,{
      container: {
        value: container || new createjs.Shape(),
        enumerable: true
      },
      graphics: {
        enumerable: true,
        get: function() {
          return this.container.graphics;
        }
      }
    });
    GameObject.call(this,id, initialState);
  }
  DrawableObject.prototype = Object.create(GameObject.prototype);
  DrawableObject.prototype.constructor = DrawableObject;
  
  DrawableObject.prototype.draw = function() {
    var fn = this.draw[this.state];
    if (isFunction(fn)) {
      fn.apply(this);
    }
  };
  
  // the mole object
  function Mole(id, size, options) {
    options = options || {};
    this.visibleOn = undefined;
    this.whacked = false;
    this.whackedOn = undefined;
    this.hiddenOn = undefined;
    this.visibleTime = options.visibleTime || 1000;
    this.cooldownTime = options.cooldownTime || 500;
    this.multiplier = options.multiplier || 1; 
    this.maxPoints = options.maxPoints || 100;
    this.minPoints = options.minPoints || 1;
    this.timers = {};
    Object.defineProperties(this, {
      isVisible: { 
        enumerable: true, 
        get: function() {
          return this.state === 'visible';
        }
      },
      delta: {
        get: function() {
          return (this.whacked ? this.whackedOn : this.hiddenOn) - 
            this.visibleOn;
        }
      },
      factor: {
        get: function() {
          return (this.visibleTime - this.delta)/this.visibleTime;
        }
      },
      score: {
        enumerable: true,
        get: function() {
          if (this.whacked) {
            return Math.max(
              this.minPoints, 
              Math.floor(this.maxPoints * this.factor * this.multiplier)
            );
          }
          return 0;
        }
      },
      x: {
        enumerable: true,
        get: function() {
          return this.container.x;
        },
        set: function(value) {
          this.container.x = value;
        }
      },
      y: {
        enumerable: true,
        get: function() {
          return this.container.y;
        },
        set: function(value) {
          this.container.y = value;
        }
      },
      size: {
        enumerable: true,
        get: function() {
          return size;
        },
        set: function(value) {
          size = value;
        }
      },
      radius: {
        get: function() {
          return this.size/2;
        }
      }
    });
    DrawableObject.call(this, id, 'init');
    this.container.addEventListener(
      'click',
      this.trigger.bind(this,'whack')
    );
  }
  Mole.prototype = Object.create(DrawableObject.prototype);
  Mole.prototype.constructor = Mole;
  
  Mole.prototype.states = {
    init: {
      play: function() {
        this.transition('wait');
      }
    },
    wait: {
      _onEnter: function () {
        setTimeout(
          this.transition.bind(this, 'visible'), 
          getRandomInt(
            this.cooldownTime,
            this.visibleTime - this.cooldownTime
          )
        );
      }
    },
    visible: {
      _onEnter: function() {
        this.visibleOn = Date.now();
        this.timers.hide = setTimeout(
          this.trigger.bind(this,'hide'), 
          this.visibleTime
        );
      },
      whack: function() {
        this.whacked = true;
        this.whackedOn = Date.now();      
        this.transition('hidden');
      },
      hide: function() {
        this.whacked = false;
        this.hiddenOn = Date.now();
        this.transition('hidden');
      },
      _onExit: function() {
        if (this.timers.hide) {
          clearTimeout(this.timers.hide);
          delete(this.timers.hide);
        }
      }
    },
    hidden: {
      _onEnter: function() {
        this.timers.cooldown = setTimeout(
          this.transition.bind(this,'final'),
          this.cooldownTime
        );
      },
      _onExit: function() {
        if (this.timers.cooldown) {
          clearTimeout(this.timers.hide);
          delete(this.timers.cooldown);
        }
      }
    },
    final: {
    }
  };
  
  Mole.prototype.draw.visible = function() {
    this.graphics
      .clear()
      .beginRadialGradientFill(
        ["rgba(255,255,255,1)", "rgba(78, 142, 169,1)"], 
        [0, 1], 0, 0, 0, 0, 0, (this.size * 0.8)
      )
      .drawCircle(this.radius, this.radius, this.radius);
  };
  Mole.prototype.draw.hidden = function() {
    this.graphics
      .clear()
      .beginFill("rgba(192, 227, 242, 0.74)")
      .drawCircle(this.radius, this.radius, this.radius);
  };
  
  function GameLevel(id, engine, options, moleOptions){
    this.id = id;
    this.engine = engine;
    this.pending = [];
    this.active = {};
    this.done = [];
    Object.defineProperties(this, {
      canvas: {
        get: function() {
          return this.stage.canvas;
        }
      },
      stage: {
        get: function() {
          return this.engine.stage;
        }
      },
      maxActive: {
        get: function(){
          return this.columns * this.rows;
        }
      },
      moleCount: {
        value: options.moleCount
      },
      moleSize: {
        get: function() {
          var x = Math.floor(this.canvas.width / this.columns);
          var y = Math.floor(this.canvas.height / this.rows);
          return Math.min(x,y);
        }
      },
      columns: {
        get: function() {
          return options.columns || 3;
        }
      },
      rows: {
        get: function() {
          return options.rows || 1;
        }
      },
      height: {
        get: function() {
          return this.moleSize * this.rows;
        }
      },
      width: {
        get: function() {
          return this.moleSize * this.columns;
        }
      },
      score: {
        get: function() {
          return this.done.reduce(function(score, mole) {
            return score + mole.score;
          }, 0);
        }
      },
      missed: {
        get: function() {
          return this.done.reduce(function(missed, mole) {
            return missed + (mole.whacked ? 0 : 1);
          }, 0);
        }
      },
      hit: {
        get: function() {
          return this.done.reduce(function(hit, mole) {
            return hit + (mole.whacked ? 1 : 0);
          }, 0);
        }
      }
    });
    Stateful.call(this, 'init');
    for(var i = 0; i < this.moleCount; i++) {
      this.pending.push(new Mole(i, this.moleSize, moleOptions));
    } 
  }
  GameLevel.prototype = Object.create(Stateful.prototype);
  GameLevel.prototype.constructor = GameLevel;
  
  GameLevel.prototype.states = {
    init: {
      start: function() {
        this.transition('play');
      }
    },
    play: {
      _onEnter: function() {
        console.log('----- Starting Level ' + this.id + ' -----');
        var x = this.canvas.width/2 - this.width/2;
        var y = this.canvas.height/2 - this.height/2;
        this.cells=[];
        for(var r = 0; r < this.rows; r++) {
          for(var c = 0; c < this.columns; c++) {
            var cell = new createjs.Shape();
            cell.x = x + (c*this.moleSize);
            cell.y = y + (r*this.moleSize);
            this.cells.push({
              x: cell.x,
              y: cell.y,
              nodes: []
            });
            cell.graphics
              .beginStroke('rgba(41, 41, 41, 0.72)')
              .drawRect(0, 0,this.moleSize, this.moleSize)
              .endStroke();
            this.stage.addChild(cell);
          }
        }
      },
      update: function() {
        var moles = Object.keys(this.active);
        if(moles.length < this.maxActive && this.pending.length > 0) {
          var mole = this.pending.shift();
          var cell = getRandomInt(0, this.maxActive);
          this.cells[cell].nodes.push(mole);
          this.active[mole.id] = mole;
        }
        var self = this;
        this.cells.forEach(function(cell) {
          if (cell.nodes.length < 1) return;
          var mole = cell.nodes[0];
          switch(mole.state) {
              case 'init':
                mole.x = cell.x;
                mole.y = cell.y;
                mole.trigger('play');
                self.stage.addChild(mole.container);
              break;
              case 'final':
                cell.nodes.shift();
                self.stage.removeChild(mole.container);
                self.done.push(mole);
                delete(self.active[mole.id]);
              break;
          }
        });
        if (this.done.length === this.moleCount) {
          this.transition('final');
        }
      },
      end: function() {
        this.transition('final');
      },
      _onExit: function() {
        this.stage.removeAllChildren();
        console.log('score: ' + this.score + ' - hit: ' + this.hit + ':' + this.moleCount);
        console.log('----- End of Level ' + this.id + ' -----');
      }
    },
    final: {}
  };
  
  function GameEngine(canvasId) {
    Object.defineProperties(this, {
      stage: {
        value: new createjs.Stage(canvasId)
      },
      canvas: {
        get: function() {
          return this.stage.canvas;
        }
      },
      currentLevel: {
        get: function() {
          return this.levels[this.level];
        }
      }
    });
    Stateful.call(this,'start-screen');
    createjs.Ticker.addEventListener('tick',this.draw.bind(this));
  }
  GameEngine.prototype = Object.create(Stateful.prototype);
  GameEngine.prototype.constructor = GameEngine;
  
  GameEngine.prototype.draw = function() {
    var fn = this.draw[this.state];
    if (isFunction(fn)) {
      fn.apply(this);
    }
    this.stage.update();
  };
  
  GameEngine.prototype.restart = function(){
    this.levels = [
      new GameLevel(0, this, {
        moleCount: 10,
        rows: 1,
        columns: 3
      },{
        visibleTime: 5000
      }),
      new GameLevel(1, this,{
        moleCount: 15,
        rows: 2,
        columns: 2
      },{
        visibleTime: 4000,
        multipler: 2
      }),
      new GameLevel(3, this,{
        moleCount: 20,
        rows: 3,
        columns: 3
      },{
        visibleTime: 4000,
        multipler: 2
      }),
      new GameLevel(4, this,{
        moleCount: 20,
        rows: 4,
        columns: 4
      },{
        visibleTime: 4500,
        cooldownTime: 150,
        multipler: 2
      })
    ];
    this.level = 0;
  };
  
  GameEngine.prototype.states = {
    'start-screen': {
      _onEnter: function() {
        this.restart();
        var text = new GameText('Click to Start!','30px');
        text.x = this.stage.canvas.width/2 - text.getMeasuredWidth()/2;
        text.y = this.stage.canvas.height/2 - text.getMeasuredHeight()/2;
        text.hitArea = new createjs.Shape();
        text.hitArea.graphics
          .beginFill("#000")
          .drawRect(0, 0, text.getMeasuredWidth(), text.getMeasuredHeight());
        createjs.Tween.get(text,{loop:true})
          .to({ alpha: 0.25 }, 1500)
          .to({ alpha: 1 }, 1500);
        var self = this;
        text.addEventListener('click', this.transition.bind(this, 'play-level'));
        this.stage.addChild(text);
      },
      _onExit: function() {
        this.stage.removeAllChildren();
      }
    },
    'play-level': {
      _onEnter: function() {
        this.currentLevel.trigger('start');
      },
      update: function() {
        this.currentLevel.trigger('update');
        if (this.currentLevel.state =='final') {
          this.transition('score-screen');
        }
      },
      end: function() {
        this.currentLevel.trigger('end');
      }
    },
    'score-screen': {
      _onEnter: function() {
        var title = new GameText('Your Score',  '30px');
        title.positionCenter(this.canvas, 20);
        this.stage.addChild(title);
        
        var score =  new GameText(this.currentLevel.score,'40px');
        score.positionCenter(this.canvas, 20, title);
        this.stage.addChild(score);
        
        var ratio = new GameText(
          this.currentLevel.hit + '/' + this.currentLevel.moleCount,
          '25px'
        );
        ratio.positionCenter(this.canvas, 20, score);
        this.stage.addChild(ratio);
        
        var next = new GameText(
          this.level == (this.levels.length -1) ?
            "GAME OVER" : "CONTINUE?",
          '50px'
        );
        next.positionCenter(this.canvas, 40, ratio);
        next.hitArea = new createjs.Shape();
        next.hitArea.graphics
          .beginFill("#000")
          .drawRect(0, 0, next.getMeasuredWidth(), next.getMeasuredHeight());
        next.addEventListener('click', this.trigger.bind(this,'done'));
        createjs.Tween.get(next,{loop:true})
          .to({ alpha:0}, 1500)
          .to({ alpha:1}, 1500);
        this.stage.addChild(next);
        
        if (this.level == (this.levels.length -1)) {
          var totals = this.levels.reduce(function(totals, level) {
            return {
              score: totals.score + level.score,
              hit: totals.hit + level.hit,
              missed: totals.missed + level.missed,
              count: totals.count + level.moleCount
            };
          },{
            score: 0,
            hit: 0,
            missed: 0,
            count: 0
          });
          
          var title2 = new GameText('Overall Score', '20px');
          title2.positionCenter(this.canvas, 40, next);
          this.stage.addChild(title2);
          
          var score2 = new GameText(totals.score, '15px');
          score2.positionCenter(this.canvas, 10, title2);
          this.stage.addChild(score2);
          
          var ratio2 = new GameText(totals.hit + '/' + totals.count, '15px');
          ratio2.positionCenter(this.canvas, 10, score2);
          this.stage.addChild(ratio2);
        }
      },
      done: function() {
        this.level +=1;
        if (this.level >= this.levels.length) {
          this.transition('start-screen');
        } else {
          this.transition('play-level');
        }
      },
      _onExit: function() {
        this.stage.removeAllChildren();
      }
    }
  };
  
  GameEngine.prototype.draw['play-level'] = function() {
    for(var key in this.currentLevel.active) {
      this.currentLevel.active[key].draw();
    }
    this.trigger('update');
  };
  
  return GameEngine;
})();
