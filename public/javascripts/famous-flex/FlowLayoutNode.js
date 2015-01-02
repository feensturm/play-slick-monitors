/**
 * This Source Code is licensed under the MIT license. If a copy of the
 * MIT-license was not distributed with this file, You can obtain one at:
 * http://opensource.org/licenses/mit-license.html.
 *
 * @author: Hein Rutjes (IjzerenHein)
 * @license MIT
 * @copyright Gloey Apps, 2014
 */

/*global define*/
/*eslint no-use-before-define:0 */

/**
 * Internal LayoutNode class used by `FlowLayoutController`.
 *
 * @module
 */
define(function(require, exports, module) {

    // import dependencies
    var OptionsManager = require('famous/core/OptionsManager');
    var Transform = require('famous/core/Transform');
    var Vector = require('famous/math/Vector');
    var Particle = require('famous/physics/bodies/Particle');
    var Spring = require('famous/physics/forces/Spring');
    var PhysicsEngine = require('famous/physics/PhysicsEngine');
    var LayoutNode = require('./LayoutNode');
    var Transitionable = require('famous/transitions/Transitionable');

    /**
     * @class
     * @extends LayoutNode
     * @param {Object} renderNode Render-node which this layout-node represents
     * @param {Spec} spec Initial state
     * @param {Object} physicsEngines physics-engines to use
     * @alias module:FlowLayoutNode
     */
    function FlowLayoutNode(renderNode, spec) {
        LayoutNode.apply(this, arguments);

        if (!this.options) {
            this.options = Object.create(this.constructor.DEFAULT_OPTIONS);
            this._optionsManager = new OptionsManager(this.options);
        }

        if (!this._pe) {
            this._pe = new PhysicsEngine();
            this._pe.sleep();
        }

        this._options = {
            spring: {
                dampingRatio: 0.8,
                period: 300
            }
        };

        if (!this._properties) {
            this._properties = {};
        }
        else {
            for (var propName in this._properties) {
                this._properties[propName].init = false;
            }
        }

        this._specModified = true;
        this._initial = true;
        if (spec) {
            this.setSpec(spec);
        }
    }
    FlowLayoutNode.prototype = Object.create(LayoutNode.prototype);
    FlowLayoutNode.prototype.constructor = FlowLayoutNode;

    FlowLayoutNode.DEFAULT_OPTIONS = {
        spring: {
            dampingRatio: 0.8,
            period: 300
        },
        particleRounding: 0.001
    };

    /**
     * Defaults
     */
    var DEFAULT = {
        opacity: 1,
        opacity2D: [1, 0],
        size: [0, 0],
        origin: [0, 0],
        align: [0, 0],
        scale: [1, 1, 1],
        translate: [0, 0, 0],
        rotate: [0, 0, 0],
        skew: [0, 0, 0]
    };

    /**
     * Verifies that the integrity of the layout-node is oke.
     */
    /*function _verifyIntegrity() {
        var i;
        for (var propName in this._properties) {
            var prop = this._properties[propName];
            if (prop.particle) {
                if (isNaN(prop.particle.getEnergy())) {
                    throw 'invalid particle energy: ' + propName;
                }
                var value = prop.particle.getPosition();
                for (i = 0; i < value.length; i++) {
                    if (isNaN(value[i])) {
                       throw 'invalid particle value: ' + propName + '(' + i + ')';
                    }
                }
                value = prop.endState.get();
                for (i = 0; i < value.length; i++) {
                    if (isNaN(value[i])) {
                       throw 'invalid endState value: ' + propName + '(' + i + ')';
                    }
                }
            }
        }
    }*/

    /**
     * Sets the configuration options
     */
    FlowLayoutNode.prototype.setOptions = function(options) {
        this._optionsManager.setOptions(options);
        var wasSleeping = this._pe.isSleeping();
        for (var propName in this._properties) {
            var prop = this._properties[propName];
            if (prop.force) {
                prop.force.setOptions(prop.force);
            }
        }
        if (wasSleeping) {
            this._pe.sleep();
        }
        return this;
    };

    /**
     * Set the properties from a spec.
     */
    FlowLayoutNode.prototype.setSpec = function(spec) {
        var set;
        if (spec.transform) {
            set = Transform.interpret(spec.transform);
        }
        if (!set) {
            set = {};
        }
        set.opacity = spec.opacity;
        set.size = spec.size;
        set.align = spec.align;
        set.origin = spec.origin;

        var oldRemoving = this._removing;
        var oldInvalidated = this._invalidated;
        this.set(set);
        this._removing = oldRemoving;
        this._invalidated = oldInvalidated;
    };

    /**
     * Reset the end-state. This function is called on all layout-nodes prior to
     * calling the layout-function. So that the layout-function starts with a clean slate.
     */
    FlowLayoutNode.prototype.reset = function() {
        if (this._invalidated) {
            for (var propName in this._properties) {
                this._properties[propName].invalidated = false;
            }
            this._invalidated = false;
        }
        this.trueSizeRequested = false;
        this.usesTrueSize = false;
    };

    /**
     * Markes the node for removal.
     */
    FlowLayoutNode.prototype.remove = function(removeSpec) {

        // Transition to the remove-spec state
        this._removing = true;
        if (removeSpec) {
            this.setSpec(removeSpec);
        }
        else {
            this._pe.sleep();
            this._specModified = false;
        }

        // Mark for removal
        this._invalidated = false;
    };

    /**
     * Locks a property, or a specific array-dimension of the property
     * fixed to the end-state value. Use this to e.g. lock the x-translation
     * to a the fixed end-state, so that when scrolling the renderable sticks
     * to the x-axis and does not feel sluggish.
     */
    FlowLayoutNode.prototype.setDirectionLock = function(direction, value) {
        if (direction === undefined) {
            this._lockDirection = undefined;
        }
        else {
            this._lockDirection = direction;
            if (value !== undefined) {
                if (!this._lockTransitionable) {
                    this._lockTransitionable = new Transitionable(1);
                }
                this._lockTransitionable.halt();
                this._lockTransitionable.reset(value);
                if (value !== 1) {
                    this._lockTransitionable.set(1, {
                        duration: (1 - value) * 1000
                    });
                }
            }
        }
    };

    /**
     * Helper function for getting the property value.
     */
    function _getRoundedValue3D(prop, def, precision) {
        if (!prop || !prop.init) {
            return def;
        }
        precision = precision || this.options.particleRounding;
        var value = prop.particle.getPosition();
        return [
            Math.round(value[0] / precision) * precision,
            Math.round(value[1] / precision) * precision,
            Math.round(value[2] / precision) * precision
        ];
    }

    /**
     * Creates the render-spec
     */
    FlowLayoutNode.prototype.getSpec = function() {

        // When the end state was reached, return the previous spec
        var endStateReached = this._pe.isSleeping();
        if (!this._specModified && endStateReached) {
            this._spec.removed = !this._invalidated;
            return this._spec;
        }
        this._initial = false;
        this._specModified = !endStateReached;
        this._spec.removed = false;

        // Step physics engine when not sleeping
        if (!endStateReached) {
            this._pe.step();
        }

        // Build fresh spec
        var value;
        var spec = this._spec;
        var precision = this.options.particleRounding;

        // opacity
        var prop = this._properties.opacity;
        if (prop && prop.init) {
            spec.opacity = Math.round(Math.max(0,Math.min(1, prop.curState.x)) / precision) * precision;
        }
        else {
            spec.opacity = undefined;
        }

        // size
        prop = this._properties.size;
        if (prop && prop.init) {
            spec.size = spec.size || [0, 0];
            spec.size[0] = Math.round(prop.curState.x / 0.1) * 0.1;
            spec.size[1] = Math.round(prop.curState.y / 0.1) * 0.1;
        }
        else {
            spec.size = undefined;
        }

        // align
        prop = this._properties.align;
        if (prop && prop.init) {
            spec.align = spec.align || [0, 0];
            spec.align[0] = Math.round(prop.curState.x / 0.1) * 0.1;
            spec.align[1] = Math.round(prop.curState.y / 0.1) * 0.1;
        }
        else {
            spec.align = undefined;
        }

        // origin
        prop = this._properties.origin;
        if (prop && prop.init) {
            spec.origin = spec.origin || [0, 0];
            spec.origin[0] = Math.round(prop.curState.x / 0.1) * 0.1;
            spec.origin[1] = Math.round(prop.curState.y / 0.1) * 0.1;
        }
        else {
            spec.origin = undefined;
        }

        // translate
        var translate = this._properties.translate;
        var translateX;
        var translateY;
        var translateZ;
        if (translate && translate.init) {
            translateX = translate.curState.x;
            translateY = translate.curState.y;
            translateZ = translate.curState.z;
            if (this._lockDirection !== undefined) {
                value = this._lockDirection ? translateY : translateX;
                var endState = this._lockDirection ? translate.endState.y : translate.endState.x;
                var lockValue = value + ((endState - value) * this._lockTransitionable.get());
                if (this._lockDirection) {
                    translateX = Math.round(translateX / precision) * precision;
                    translateY = Math.round(lockValue / precision) * precision;
                }
                else {
                    translateX = Math.round(lockValue / precision) * precision;
                    translateY = Math.round(translateY / precision) * precision;
                }
            }
        }
        else {
            translateX = 0;
            translateY = 0;
            translateZ = 0;
        }

        // scale, skew, scale
        var scale = this._properties.scale;
        var skew = this._properties.skew;
        var rotate = this._properties.rotate;
        if (scale || skew || rotate) {
            spec.transform = Transform.build({
                translate: [translateX, translateY, translateZ],
                skew: _getRoundedValue3D.call(this, skew, DEFAULT.skew),
                scale: _getRoundedValue3D.call(this, scale, DEFAULT.scale),
                rotate: _getRoundedValue3D.call(this, rotate, DEFAULT.rotate)
            });
        }
        else if (translate) {
            if (!spec.transform) {
                spec.transform = Transform.translate(translateX, translateY, translateZ);
            }
            else {
                spec.transform[12] = translateX;
                spec.transform[13] = translateY;
                spec.transform[14] = translateZ;
            }
        }
        else {
            spec.transform = undefined;
        }

        //if (this.renderNode._debug) {
            //this.renderNode._debug = false;
            /*console.log(JSON.stringify({
                opacity: this._spec.opacity,
                size: this._spec.size,
                align: this._spec.align,
                origin: this._spec.origin,
                transform: this._spec.transform
            }));*/
        //}
        return this._spec;
    };

    /**
     * Helper function to set the property of a node (e.g. opacity, translate, etc..)
     */
    function _setPropertyValue(prop, propName, endState, defaultValue, immediate, isTranslate) {

        // Get property
        prop = prop || this._properties[propName];

        // Update the property
        if (prop && prop.init) {
            prop.invalidated = true;
            var value = defaultValue;
            if (endState !== undefined) {
                value = endState;
            }
            else if (this._removing) {
                value = prop.particle.getPosition();
            }
            if (isTranslate && (this._lockDirection !== undefined) && (this._lockTransitionable.get() === 1)) {
                immediate = true; // this is a bit dirty, it should check !_lockDirection for non changes as well before setting immediate to true
            }
            // set new end state (the quick way)
            prop.endState.x = value[0];
            prop.endState.y = (value.length > 1) ? value[1] : 0;
            prop.endState.z = (value.length > 2) ? value[2] : 0;
            if (immediate) {
                // set current state (the quick way)
                prop.curState.x = prop.endState.x;
                prop.curState.y = prop.endState.y;
                prop.curState.z = prop.endState.z;
                // reset velocity (the quick way)
                prop.velocity.x = 0;
                prop.velocity.y = 0;
                prop.velocity.z = 0;
            }
            else if ((prop.endState.x !== prop.curState.x) ||
                     (prop.endState.y !== prop.curState.y) ||
                     (prop.endState.z !== prop.curState.z)) {
                this._pe.wake();
            }
            return;
        }
        else {

            // Create property if neccesary
            var wasSleeping = this._pe.isSleeping();
            if (!prop) {
                prop = {
                    particle: new Particle({
                        position: (this._initial || immediate) ? endState : defaultValue
                    }),
                    endState: new Vector(endState)
                };
                prop.curState = prop.particle.position;
                prop.velocity = prop.particle.velocity;
                prop.force = new Spring(this.options.spring);
                prop.force.setOptions({
                    anchor: prop.endState
                });
                this._pe.addBody(prop.particle);
                prop.forceId = this._pe.attach(prop.force, prop.particle);
                this._properties[propName] = prop;
            }
            else {
                prop.particle.setPosition((this._initial || immediate) ? endState : defaultValue);
                prop.endState.set(endState);
            }
            if (!this._initial && !immediate) {
                this._pe.wake();
            } else if (wasSleeping) {
                this._pe.sleep(); // nothing has changed, put back to sleep
            }
            prop.init = true;
            prop.invalidated = true;
        }
    }

    /**
     * Get value if not equals.
     */
    function _getIfNE2D(a1, a2) {
        return ((a1[0] === a2[0]) && (a1[1] === a2[1])) ? undefined : a1;
    }
    function _getIfNE3D(a1, a2) {
        return ((a1[0] === a2[0]) && (a1[1] === a2[1]) && (a1[2] === a2[2])) ? undefined : a1;
    }

    /**
     * context.set(..)
     */
    FlowLayoutNode.prototype.set = function(set, defaultSize) {
        this._removing = false;
        this._invalidated = true;
        this.scrollLength = set.scrollLength;
        this._specModified = true;

        // opacity
        var prop = this._properties.opacity;
        var value = (set.opacity === DEFAULT.opacity) ? undefined : set.opacity;
        if ((value !== undefined) || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'opacity', (value === undefined) ? undefined : [value, 0], DEFAULT.opacity2D);
        }

        // set align
        prop = this._properties.align;
        value = set.align ? _getIfNE2D(set.align, DEFAULT.align) : undefined;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'align', value, DEFAULT.align);
        }

        // set orgin
        prop = this._properties.origin;
        value = set.origin ? _getIfNE2D(set.origin, DEFAULT.origin) : undefined;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'origin', value, DEFAULT.origin);
        }

        // set size
        prop = this._properties.size;
        value = set.size || defaultSize;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'size', value, defaultSize, this.usesTrueSize);
        }

        // set translate
        prop = this._properties.translate;
        value = set.translate;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'translate', value, DEFAULT.translate, undefined, true);
        }

        // set scale
        prop = this._properties.scale;
        value = set.scale ? _getIfNE3D(set.scale, DEFAULT.scale) : undefined;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'scale', value, DEFAULT.scale);
        }

        // set rotate
        prop = this._properties.rotate;
        value = set.rotate ? _getIfNE3D(set.rotate, DEFAULT.rotate) : undefined;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'rotate', value, DEFAULT.rotate);
        }

        // set skew
        prop = this._properties.skew;
        value = set.skew ? _getIfNE3D(set.skew, DEFAULT.skew) : undefined;
        if (value || (prop && prop.init)) {
            _setPropertyValue.call(this, prop, 'skew', value, DEFAULT.skew);
        }
    };

    module.exports = FlowLayoutNode;
});
