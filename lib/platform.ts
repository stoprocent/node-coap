/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

/**
 * Platform abstraction layer for React Native compatibility.
 *
 * This module provides abstractions over Node.js-specific APIs
 * (dgram, crypto, net, os) so that alternative implementations
 * can be injected for environments like React Native.
 *
 * In React Native, use `setTransportProvider()` with react-native-udp
 * and `setRandomBytesProvider()` with react-native-get-random-values.
 */

import { EventEmitter } from 'events'

/**
 * Minimal socket interface used by node-coap.
 * Compatible with dgram.Socket and react-native-udp sockets.
 */
export interface CoapSocket extends EventEmitter {
    send (msg: Buffer, offset: number, length: number, port: number, address?: string, callback?: (error: Error | null, bytes: number) => void): void
    bind (port: number, address?: string, callback?: () => void): void
    close (callback?: () => void): void
    address (): { address: string, family: string, port: number }
    addMembership? (multicastAddress: string, multicastInterface?: string): void
    setMulticastLoopback? (flag: boolean): void
}

export interface SocketOptions {
    type: 'udp4' | 'udp6'
    reuseAddr?: boolean
}

export type TransportProvider = (options: SocketOptions) => CoapSocket
export type RandomBytesProvider = (size: number) => Buffer

// --- Providers (user-overridable) ---

let _transportProvider: TransportProvider | null = null
let _randomBytesProvider: RandomBytesProvider | null = null

/**
 * Set a custom transport provider for creating UDP sockets.
 *
 * For React Native, pass a function that wraps react-native-udp:
 * ```
 * import dgram from 'react-native-udp'
 * setTransportProvider((opts) => dgram.createSocket(opts))
 * ```
 */
export function setTransportProvider (provider: TransportProvider): void {
    _transportProvider = provider
}

/**
 * Set a custom random bytes provider.
 *
 * For React Native, after installing react-native-get-random-values:
 * ```
 * import 'react-native-get-random-values'
 * // Then crypto.getRandomValues is available globally
 * setRandomBytesProvider((size) => {
 *     const buf = Buffer.alloc(size)
 *     crypto.getRandomValues(buf)
 *     return buf
 * })
 * ```
 */
export function setRandomBytesProvider (provider: RandomBytesProvider): void {
    _randomBytesProvider = provider
}

/**
 * Get the current transport provider, falling back to Node.js dgram.
 */
export function getTransportProvider (): TransportProvider {
    if (_transportProvider != null) {
        return _transportProvider
    }

    // Lazy-load dgram to avoid crashing in React Native
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const dgram = require('dgram')
        return (options: SocketOptions) => dgram.createSocket(options)
    } catch {
        throw new Error(
            'No transport provider available. In React Native, call setTransportProvider() ' +
            'with a react-native-udp factory before using node-coap.'
        )
    }
}

/**
 * Create a UDP socket using the configured transport provider.
 */
export function createCoapSocket (options: SocketOptions): CoapSocket {
    return getTransportProvider()(options)
}

/**
 * Generate cryptographically random bytes.
 * Falls back to Node.js crypto module if no custom provider is set.
 */
export function randomBytes (size: number): Buffer {
    if (_randomBytesProvider != null) {
        return _randomBytesProvider(size)
    }

    // Lazy-load crypto to avoid crashing in React Native
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const crypto = require('crypto')
        return crypto.randomBytes(size)
    } catch {
        throw new Error(
            'No random bytes provider available. In React Native, call setRandomBytesProvider() ' +
            'before using node-coap.'
        )
    }
}

/**
 * Constant-time buffer comparison.
 * Falls back to Node.js crypto.timingSafeEqual if no custom provider is set.
 * In React Native, a pure-JS constant-time comparison is used as fallback.
 */
export function timingSafeEqual (a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
        return false
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const crypto = require('crypto')
        return crypto.timingSafeEqual(a, b)
    } catch {
        // Pure-JS constant-time comparison for React Native
        let result = 0
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i]
        }
        return result === 0
    }
}

/**
 * Check if an address string is an IPv6 address.
 * Replaces dependency on `net.isIPv6()` for React Native compatibility.
 */
export function isIPv6 (address: string): boolean {
    // Simple heuristic: IPv6 addresses contain colons
    // This matches the behavior of net.isIPv6() for valid addresses
    return address.includes(':')
}

/**
 * Get all network interface addresses for the given protocol family.
 * Returns an empty array in React Native (multicast enumeration not supported).
 */
export function getNetworkAddresses (type: 'udp4' | 'udp6'): string[] {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const os = require('os')
        const family = type === 'udp6' ? 'IPv6' : 'IPv4'
        const addresses: string[] = []
        const macs: string[] = []
        const interfaces = os.networkInterfaces()
        for (const ifname in interfaces) {
            if (ifname in interfaces) {
                interfaces[ifname]?.forEach((a: any) => {
                    if (a.family === family && !macs.includes(a.mac)) {
                        addresses.push(a.address)
                        macs.push(a.mac)
                    }
                })
            }
        }
        return addresses
    } catch {
        // os module not available (React Native) - multicast enumeration not supported
        return []
    }
}
